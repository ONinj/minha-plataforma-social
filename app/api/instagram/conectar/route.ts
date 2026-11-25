import { assinar } from "@/lib/servidor/cripto";
import { urlDeAutorizacao } from "@/lib/servidor/instagram";
import { ErroHttp, contexto, exigirRecurso, responderErro } from "@/lib/servidor/contexto";

export const runtime = "nodejs";

// Devolve o link do login do Instagram para conectar a conta a um perfil.
export async function POST(req: Request) {
  try {
    const ctx = await contexto(req);
    exigirRecurso(!!ctx.recursos.instagram, "A publicação automática no Instagram não está no seu plano.");
    if (!process.env.INSTAGRAM_APP_ID || !process.env.INSTAGRAM_APP_SECRET) {
      throw new ErroHttp(400, "A conexão com o Instagram ainda não foi configurada na plataforma.");
    }
    const { perfil } = (await req.json()) as { perfil: string };
    if (!perfil) throw new ErroHttp(400, "Perfil não informado.");
    const state = assinar({ c: ctx.conta.id, p: perfil, u: ctx.userId, e: Date.now() + 15 * 60_000 });
    return Response.json({ url: urlDeAutorizacao(req, state) });
  } catch (e) {
    return responderErro(e);
  }
}
