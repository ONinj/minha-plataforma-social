import { verificarAssinatura } from "@/lib/servidor/cripto";
import { salvarConexao, trocarCodigo } from "@/lib/servidor/instagram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// O Instagram volta para cá depois que a pessoa autoriza. Guardamos o token e voltamos ao app.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const voltar = (q: Record<string, string>) => Response.redirect(`${url.origin}/?${new URLSearchParams(q)}`, 302);
  const erro = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (erro) return voltar({ instagram: "erro", msg: erro });
  const code = url.searchParams.get("code")?.replace(/#_$/, "");
  const st = verificarAssinatura<{ c: string; p: string; u: string; e: number }>(url.searchParams.get("state") ?? "");
  if (!code || !st || st.e < Date.now()) return voltar({ instagram: "erro", msg: "Link expirado. Tente conectar de novo." });
  try {
    const c = await trocarCodigo(req, code);
    await salvarConexao(st.c, st.p, c);
    return voltar({ instagram: "ok", usuario: c.username, perfil: st.p });
  } catch (e) {
    return voltar({ instagram: "erro", msg: e instanceof Error ? e.message : String(e) });
  }
}
