import { MODO_NUVEM, contexto, responderErro, sql } from "@/lib/servidor/contexto";

export const runtime = "nodejs";

// Dados da conta logada: plano, recursos, saldo, outras contas da pessoa e planos à venda.
export async function GET(req: Request) {
  if (!MODO_NUVEM) return Response.json({ modo: "local" });
  try {
    const ctx = await contexto(req, { criarSeNaoExistir: true });
    const db = sql();
    const contas = await db`select c.id, c.nome, c.plano_id, m.papel from contas c join membros m on m.conta_id = c.id
      where m.user_id = ${ctx.userId}::uuid order by m.criado_em`;
    const planos = await db`select id, nome, preco, creditos_mensais, recursos from planos where publico order by ordem`;
    const [pendente] = await db`select plano_pendente from contas where id = ${ctx.conta.id}::uuid`;
    return Response.json({
      modo: "nuvem",
      usuario: { id: ctx.userId, email: ctx.email, admin: ctx.admin },
      conta: { ...ctx.conta, papel: ctx.papel, plano_pendente: pendente?.plano_pendente ?? null },
      plano: ctx.plano,
      recursos: ctx.recursos,
      cambio: ctx.cambio,
      precos: ctx.precos,
      contas,
      planos: planos.map((p) => ({ ...p, preco: Number(p.preco), creditos_mensais: Number(p.creditos_mensais) })),
      whatsapp: process.env.NEXT_PUBLIC_WHATSAPP ?? "",
      cobranca: !!process.env.ASAAS_API_KEY,
      instagramConfigurado: !!(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET && process.env.CHAVE_CRIPTO),
    });
  } catch (e) {
    return responderErro(e);
  }
}

// Muda o nome da conta ou as preferências (modelos escolhidos, confirmações...).
export async function PATCH(req: Request) {
  try {
    const ctx = await contexto(req);
    const c = (await req.json()) as { nome?: string; preferencias?: Record<string, unknown> };
    const db = sql();
    if (c.nome) await db`update contas set nome = ${c.nome.slice(0, 80)} where id = ${ctx.conta.id}::uuid`;
    if (c.preferencias) await db`update contas set preferencias = ${db.json(c.preferencias as never)} where id = ${ctx.conta.id}::uuid`;
    return Response.json({ ok: true });
  } catch (e) {
    return responderErro(e);
  }
}
