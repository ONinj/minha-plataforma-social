import { contexto, responderErro, sql } from "@/lib/servidor/contexto";

export const runtime = "nodejs";

// Lista as contas do Instagram conectadas nos perfis desta conta (sem os tokens).
export async function GET(req: Request) {
  try {
    const ctx = await contexto(req);
    const conexoes = await sql()`select perfil_id, username, expira_em from conexoes_instagram where conta_id = ${ctx.conta.id}::uuid`;
    return Response.json({ conexoes });
  } catch (e) {
    return responderErro(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await contexto(req);
    const perfil = new URL(req.url).searchParams.get("perfil");
    await sql()`delete from conexoes_instagram where perfil_id = ${perfil} and conta_id = ${ctx.conta.id}::uuid`;
    return Response.json({ ok: true });
  } catch (e) {
    return responderErro(e);
  }
}
