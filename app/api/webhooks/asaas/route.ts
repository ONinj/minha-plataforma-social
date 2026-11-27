import { createHash, timingSafeEqual } from "crypto";
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
async function registrarPagamento(conta: string, tipo: "assinatura" | "recarga", p: { id: string; value?: number; netValue?: number; description?: string }) {
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
type Pagamento = { id: string; status?: string; subscription?: string | null; externalReference?: string | null; value?: number; netValue?: number; description?: string };

const PAGO = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];
const ESTORNADO = ["REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL"];

/** Compara o token sem dar pistas pelo tempo de resposta. */
function tokenConfere(recebido: string | undefined, esperado: string) {
  if (!recebido) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

/** Tira créditos uma única vez (o Asaas pode repetir o aviso). */
async function retirarUmaVez(conta: string, creditos: number, descricao: string, ref: string) {
  const db = sql();
  const [ja] = await db`select 1 from movimentos where conta_id = ${conta}::uuid and tipo = 'uso' and ref = ${ref}`;
  if (ja || !(creditos > 0)) return;
  await db`select debitar(${conta}::uuid, null, ${creditos}, ${descricao}, ${ref}, null, true)`;
}

export async function POST(req: Request) {
  const token = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  const recebido = req.headers.get("asaas-access-token")?.trim();
  if (!token || !tokenConfere(recebido, token)) {
    await registrarAviso({
      resultado: !token ? "recusado: falta ASAAS_WEBHOOK_TOKEN na Vercel" : !recebido ? "recusado: o Asaas não mandou token (preencha o token no webhook)" : "recusado: o token do webhook no Asaas é diferente do ASAAS_WEBHOOK_TOKEN da Vercel",
    });
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }
  const ev = (await req.json()) as Evento;
  await registrarAviso({ resultado: "recebido", evento: ev.event });
  const db = sql();

  try {
    // Nunca confia só no aviso: busca o pagamento direto na API do Asaas e usa os dados de lá.
    let p: Pagamento | null = null;
    if (ev.payment?.id) p = await asaas<Pagamento>(`/payments/${encodeURIComponent(ev.payment.id)}`);

    if ((ev.event === "PAYMENT_CONFIRMED" || ev.event === "PAYMENT_RECEIVED") && p && PAGO.includes(p.status ?? "")) {
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
        // Confere o valor pago (o maior desconto de plano é 15%).
        if (pk && Number(p.value) >= pk.valor * 0.85 - 0.01) {
          await db`select creditar(${conta}::uuid, ${pk.creditos}, 'recarga', ${`Recarga de ${pk.nome}`}, ${p.id})`;
          await registrarPagamento(conta, "recarga", p);
        }
      }
    } else if (ev.event === "PAYMENT_OVERDUE" && p?.subscription && p.status === "OVERDUE") {
      await db`update contas set status = 'atrasado' where asaas_assinatura = ${p.subscription}`;
    } else if ((ev.event === "PAYMENT_REFUNDED" || ev.event === "PAYMENT_CHARGEBACK_REQUESTED") && p && ESTORNADO.includes(p.status ?? "")) {
      if (p.externalReference?.startsWith("recarga:")) {
        const [, conta, pacote] = p.externalReference.split(":");
        const pk = PACOTES[pacote];
        if (pk) await retirarUmaVez(conta, pk.creditos, "Recarga estornada", `estorno:${p.id}`);
      } else {
        // Mensalidade estornada: retira os créditos que aquele pagamento deu.
        const [m] = await db`select conta_id, creditos from movimentos where tipo = 'mensalidade' and ref = ${p.id} limit 1`;
        if (m) await retirarUmaVez(m.conta_id, Number(m.creditos), "Mensalidade estornada", `estorno:${p.id}`);
      }
      await db`update pagamentos set estornado = true where id = ${p.id}`.catch(() => {});
    } else if ((ev.event === "SUBSCRIPTION_DELETED" || ev.event === "SUBSCRIPTION_INACTIVATED") && ev.subscription?.id) {
      const s = await asaas<{ deleted?: boolean; status?: string }>(`/subscriptions/${encodeURIComponent(ev.subscription.id)}`).catch(() => ({ deleted: true, status: undefined as string | undefined }));
      if (s.deleted || s.status === "INACTIVE" || s.status === "EXPIRED") {
        await db`update contas set status = 'cancelado', asaas_assinatura = null where asaas_assinatura = ${ev.subscription.id}`;
      }
    }
  } catch (e) {
    console.error("Webhook Asaas", ev.event, e);
    return Response.json({ error: "falha" }, { status: 500 }); // o Asaas tenta de novo
  }
  return Response.json({ ok: true });
}
