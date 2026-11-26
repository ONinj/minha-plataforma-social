import { PACOTES, asaas, hoje, valorRecarga } from "@/lib/servidor/asaas";
import { ErroHttp, contexto, responderErro, sql } from "@/lib/servidor/contexto";

export const runtime = "nodejs";

type Corpo =
  | { acao: "assinar"; plano: string; nome?: string; cpfCnpj?: string }
  | { acao: "recarga"; pacote: string; nome?: string; cpfCnpj?: string }
  | { acao: "cancelar" };

/** Garante o cliente no Asaas (CPF/CNPJ é obrigatório para gerar cobranças). */
async function clienteAsaas(ctx: Awaited<ReturnType<typeof contexto>>, nome?: string, cpfCnpj?: string) {
  if (ctx.conta.asaas_cliente) return ctx.conta.asaas_cliente;
  const doc = (cpfCnpj ?? "").replace(/\D/g, "");
  if (doc.length !== 11 && doc.length !== 14) throw new ErroHttp(400, "Informe um CPF ou CNPJ válido para a cobrança.", "documento");
  const cli = await asaas<{ id: string }>("/customers", "POST", {
    name: nome || ctx.conta.nome,
    cpfCnpj: doc,
    email: ctx.conta.email_cobranca || ctx.email,
    externalReference: ctx.conta.id,
    notificationDisabled: false,
  });
  await sql()`update contas set asaas_cliente = ${cli.id} where id = ${ctx.conta.id}::uuid`;
  return cli.id;
}

export async function POST(req: Request) {
  try {
    const ctx = await contexto(req);
    if (ctx.papel !== "dono") throw new ErroHttp(403, "Só o dono da conta pode mudar o plano ou pagar.");
    const c = (await req.json()) as Corpo;
    const db = sql();

    if (c.acao === "assinar") {
      const [plano] = await db`select * from planos where id = ${c.plano} and publico`;
      if (!plano) throw new ErroHttp(400, "Plano inválido.");
      const cliente = await clienteAsaas(ctx, c.nome, c.cpfCnpj);
      // Cria a nova assinatura; a antiga só é cancelada quando o primeiro pagamento da nova cair (webhook).
      const sub = await asaas<{ id: string }>("/subscriptions", "POST", {
        customer: cliente,
        billingType: "UNDEFINED", // o cliente escolhe Pix, boleto ou cartão na fatura
        value: Number(plano.preco),
        nextDueDate: hoje(),
        cycle: "MONTHLY",
        description: `Galhos · Plano ${plano.nome}`,
        externalReference: `assinatura:${ctx.conta.id}:${plano.id}`,
      });
      await db`update contas set asaas_assinatura_pendente = ${sub.id}, plano_pendente = ${plano.id} where id = ${ctx.conta.id}::uuid`;
      const pagamentos = await asaas<{ data: { invoiceUrl: string }[] }>(`/subscriptions/${sub.id}/payments`);
      return Response.json({ url: pagamentos.data?.[0]?.invoiceUrl ?? null });
    }

    if (c.acao === "recarga") {
      const pacote = PACOTES[c.pacote];
      if (!pacote) throw new ErroHttp(400, "Pacote inválido.");
      if (ctx.conta.plano_id === "teste") throw new ErroHttp(400, "Escolha um plano antes de comprar recargas.");
      const cliente = await clienteAsaas(ctx, c.nome, c.cpfCnpj);
      const pag = await asaas<{ invoiceUrl: string }>("/payments", "POST", {
        customer: cliente,
        billingType: "UNDEFINED",
        value: valorRecarga(pacote.valor, ctx.recursos.desconto_recarga),
        dueDate: hoje(),
        description: `Galhos · Recarga de ${pacote.nome}`,
        externalReference: `recarga:${ctx.conta.id}:${c.pacote}`,
      });
      return Response.json({ url: pag.invoiceUrl });
    }

    if (c.acao === "cancelar") {
      if (ctx.conta.asaas_assinatura) await asaas(`/subscriptions/${ctx.conta.asaas_assinatura}`, "DELETE");
      // Os créditos que sobraram continuam valendo até acabarem.
      await db`update contas set status = 'cancelado', asaas_assinatura = null where id = ${ctx.conta.id}::uuid`;
      return Response.json({ ok: true });
    }
    throw new ErroHttp(400, "Ação inválida.");
  } catch (e) {
    return responderErro(e);
  }
}
