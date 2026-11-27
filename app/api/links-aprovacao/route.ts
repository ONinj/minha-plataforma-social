import { hashToken, novoToken } from "@/lib/servidor/aprovacao";
import { ErroHttp, contexto, exigirPerfilDaConta, responderErro, sql } from "@/lib/servidor/contexto";

export const runtime = "nodejs";

// Cria um link para o cliente final aprovar as peças escolhidas de um perfil.
export async function POST(req: Request) {
  try {
    const ctx = await contexto(req);
    const c = (await req.json()) as { perfil: string; itens: string[]; dias?: number; nome?: string };
    await exigirPerfilDaConta(ctx.conta.id, c.perfil);
    const itens = [...new Set((c.itens ?? []).filter((x) => typeof x === "string" && x.length <= 80))].slice(0, 50);
    if (!itens.length) throw new ErroHttp(400, "Escolha pelo menos uma peça.");
    const db = sql();
    const [p] = await db`select dados->'aprovacoes' as aprovacoes from perfis where id = ${c.perfil} and conta_id = ${ctx.conta.id}::uuid`;
    const existentes = new Set(((p?.aprovacoes ?? []) as { id: string }[]).map((a) => a.id));
    const validos = itens.filter((i) => existentes.has(i));
    if (!validos.length) throw new ErroHttp(400, "Essas peças ainda não foram salvas na nuvem. Espere alguns segundos e tente de novo.");
    const dias = Math.min(60, Math.max(1, Math.round(Number(c.dias) || 14)));
    const token = novoToken();
    const [l] = await db`insert into links_aprovacao (token_hash, conta_id, perfil_id, nome, itens, criado_por, expira_em)
      values (${hashToken(token)}, ${ctx.conta.id}::uuid, ${c.perfil}, ${(c.nome ?? "").slice(0, 80) || null}, ${validos}, ${ctx.userId}::uuid, now() + ${`${dias} days`}::interval)
      returning id, expira_em`;
    const origem = new URL(req.url).origin;
    return Response.json({ id: l.id, url: `${origem}/aprovar/${token}`, expira_em: l.expira_em, itens: validos.length });
  } catch (e) {
    if (String((e as { code?: string }).code) === "42P01") {
      return responderErro(new ErroHttp(503, "Falta rodar a atualização do banco (supabase/migrations/008_aprovacao_cliente.sql)."));
    }
    return responderErro(e);
  }
}

// Links do perfil (sem o código: ele só aparece na hora de criar).
export async function GET(req: Request) {
  try {
    const ctx = await contexto(req);
    const perfil = new URL(req.url).searchParams.get("perfil") ?? "";
    const links = await sql()`select l.id, l.nome, l.criado_em, l.expira_em, l.revogado, cardinality(l.itens) as itens,
        (select count(*) from decisoes_cliente d where d.link_id = l.id)::int as respostas
      from links_aprovacao l where l.conta_id = ${ctx.conta.id}::uuid and l.perfil_id = ${perfil}
      order by l.criado_em desc limit 30`;
    return Response.json({ links });
  } catch (e) {
    return responderErro(e);
  }
}

// Desativa um link (o cliente não consegue mais abrir).
export async function DELETE(req: Request) {
  try {
    const ctx = await contexto(req);
    const id = new URL(req.url).searchParams.get("id") ?? "";
    await sql()`update links_aprovacao set revogado = true where id = ${id}::uuid and conta_id = ${ctx.conta.id}::uuid`;
    return Response.json({ ok: true });
  } catch (e) {
    return responderErro(e);
  }
}
