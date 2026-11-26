import { contexto, responderErro } from "@/lib/servidor/contexto";
import { mesDe, nomeDoMes, usoPorMes } from "@/lib/servidor/cota";

export const runtime = "nodejs";

/** Limite de publicação automática do plano e quanto o perfil já usou neste mês e nos próximos dois. */
export async function GET(req: Request) {
  try {
    const ctx = await contexto(req);
    const perfil = new URL(req.url).searchParams.get("perfil") ?? "";
    const agora = new Date();
    const meses = [0, 1, 2].map((i) => mesDe(new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + i, 15))));
    const limites = ctx.recursos.publicacao_mensal ?? null;
    const uso = await usoPorMes(ctx.conta.id, perfil, meses);
    return Response.json({
      liberado: !!ctx.recursos.instagram,
      limites,
      perfis: ctx.recursos.perfis_publicacao ?? null,
      meses: meses.map((m) => ({ mes: m, nome: nomeDoMes(m), usados: uso[m] })),
    });
  } catch (e) {
    return responderErro(e);
  }
}
