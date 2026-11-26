import { PACOTES, asaas, registrarAviso } from "@/lib/servidor/asaas";
import { sql } from "@/lib/servidor/contexto";

export const runtime = "nodejs";

type Evento = {
  id?: string;
  event: string;
  payment?: { id: string; subscription?: string; externalReference?: string; value?: number; netValue?: number; description?: string };
  subscription?: { id: string };
};

/** Guarda o pagamento para o painel (se a tabela ainda não existir, não atrapalha a renovação). */
async function registrarPagamento(conta: string, tipo: "assinatura" | "recarga", p: NonNullable<Evento["payment"]>) {
  if (p.value == null) return;
  await sql()`insert into pagamentos (id, conta_id, tipo, valor, valor_liquido, descricao)
    values (${p.id}, ${conta}::uuid, ${tipo}, ${p.value}, ${p.netValue ?? null}, ${p.description ?? null})
    on conflict (id) do nothing`.catch((e) => console.warn("pagamentos", e));
}

/**
 * Avisos do Asaas: pagamento confirmado renova os créditos do mês (ou credita a recarga),
 * atraso bloqueia o uso e cancelamento marca a conta. Tudo idempotente (o Asaas pode
 * mandar o mesmo aviso mais de uma vez).
 */
export async function POST(req: Request) {
  const token = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  const recebido = req.headers.get("asaas-access-token")?.trim();
  if (!token || recebido !== token) {
    await registrarAviso({
      resultado: !token ? "recusado: falta ASAAS_WEBHOOK_TOKEN na Vercel" : !recebido ? "recusado: o Asaas não mandou token (preencha o token no webhook)" : "recusado: o token do webhook no Asaas é diferente do ASAAS_WEBHOOK_TOKEN da Vercel",
    });
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }
  const ev = (await req.json()) as Evento;
  await registrarAviso({ resultado: "recebido", evento: ev.event });
  const db = sql();
  const p = ev.payment;

  try {
    if ((ev.event === "PAYMENT_CONFIRMED" || ev.event === "PAYMENT_RECEIVED") && p) {
      if (p.subscription) {
        const [conta] = await db`select id, asaas_assinatura, asaas_assinatura_pendente, plano_pendente from contas
          where asaas_assinatura = ${p.subscription} or asaas_assinatura_pendente = ${p.subscription} limit 1`;
        if (conta) {
          if (conta.asaas_assinatura_pendente === p.subscription) {
            // Primeiro pagamento do plano novo: troca o plano e cancela a assinatura antiga.
            const antiga = conta.asaas_assinatura;
            await db`update contas set asaas_assinatura = ${p.subscription}, plano_id = ${conta.plano_pendente},
              asaas_assinatura_pendente = null, plano_pendente = null where id = ${conta.id}`;
            if (antiga && antiga !== p.subscription) await asaas(`/subscriptions/${antiga}`, "DELETE").catch(() => {});
          }
          await db`select renovar_mensalidade(${conta.id}::uuid, ${p.id})`;
          await registrarPagamento(conta.id, "assinatura", p);
        }
      } else if (p.externalReference?.startsWith("recarga:")) {
        const [, conta, pacote] = p.externalReference.split(":");
        const pk = PACOTES[pacote];
        if (pk) await db`select creditar(${conta}::uuid, ${pk.creditos}, 'recarga', ${`Recarga de ${pk.nome}`}, ${p.id})`;
        await registrarPagamento(conta, "recarga", p);
      }
    } else if (ev.event === "PAYMENT_OVERDUE" && p?.subscription) {
      await db`update contas set status = 'atrasado' where asaas_assinatura = ${p.subscription}`;
    } else if ((ev.event === "PAYMENT_REFUNDED" || ev.event === "PAYMENT_CHARGEBACK_REQUESTED") && p?.externalReference?.startsWith("recarga:")) {
      const [, conta, pacote] = p.externalReference.split(":");
      const pk = PACOTES[pacote];
      if (pk) await db`select debitar(${conta}::uuid, null, ${pk.creditos}, 'Recarga estornada', ${`estorno:${p.id}`}, null, true)`;
      await db`update pagamentos set estornado = true where id = ${p.id}`.catch(() => {});
    } else if ((ev.event === "PAYMENT_REFUNDED" || ev.event === "PAYMENT_CHARGEBACK_REQUESTED") && p) {
      await db`update pagamentos set estornado = true where id = ${p.id}`.catch(() => {});
    } else if ((ev.event === "SUBSCRIPTION_DELETED" || ev.event === "SUBSCRIPTION_INACTIVATED") && ev.subscription?.id) {
      await db`update contas set status = 'cancelado', asaas_assinatura = null where asaas_assinatura = ${ev.subscription.id}`;
    }
  } catch (e) {
    console.error("Webhook Asaas", ev.event, e);
    return Response.json({ error: "falha" }, { status: 500 }); // o Asaas tenta de novo
  }
  return Response.json({ ok: true });
}
