import { MODO_NUVEM, sql } from "@/lib/servidor/contexto";

export const runtime = "nodejs";

/** Depoimentos publicados (página de vendas). */
export async function GET() {
  if (!MODO_NUVEM) return Response.json({ depoimentos: [] });
  try {
    const depoimentos = await sql()`select id, nome, cargo, texto, nota from depoimentos where publicado order by ordem, criado_em limit 12`;
    return Response.json({ depoimentos }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return Response.json({ depoimentos: [] });
  }
}
