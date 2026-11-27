import { contexto, responderErro, sql } from "@/lib/servidor/contexto";

export const runtime = "nodejs";

// Respostas dos clientes (link de aprovação) de um perfil, depois de uma data.
export async function GET(req: Request) {
  try {
    const ctx = await contexto(req);
    const q = new URL(req.url).searchParams;
    const perfil = q.get("perfil") ?? "";
    const desde = new Date(q.get("desde") || 0);
    const decisoes = await sql()`select aprovacao_id, decisao, comentario, nome, em from decisoes_cliente
      where conta_id = ${ctx.conta.id}::uuid and perfil_id = ${perfil} and em > ${isNaN(desde.getTime()) ? new Date(0) : desde}
      order by em limit 200`;
    return Response.json({ decisoes });
  } catch (e) {
    // Banco ainda sem a atualização 008: sem respostas (não é erro para o usuário).
    if (String((e as { code?: string }).code) === "42P01") return Response.json({ decisoes: [] });
    return responderErro(e);
  }
}
