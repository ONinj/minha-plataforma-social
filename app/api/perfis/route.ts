import { ErroHttp, contexto, responderErro, sql } from "@/lib/servidor/contexto";

export const runtime = "nodejs";
export const maxDuration = 30;

// Lista os perfis da conta (com a versão, para sincronizar entre aparelhos).
export async function GET(req: Request) {
  try {
    const ctx = await contexto(req);
    const desde = Number(new URL(req.url).searchParams.get("desde") ?? 0);
    const linhas = await sql()`select id, dados, versao, apagado, extract(epoch from atualizado_em) as em from perfis
      where conta_id = ${ctx.conta.id}::uuid and extract(epoch from atualizado_em) > ${desde} order by atualizado_em`;
    return Response.json({ perfis: linhas.map((l) => ({ ...l, em: Number(l.em) })) });
  } catch (e) {
    return responderErro(e);
  }
}

// Salva um perfil inteiro. Respeita o limite de perfis do plano.
export async function PUT(req: Request) {
  try {
    const ctx = await contexto(req);
    const { id, dados } = (await req.json()) as { id: string; dados: unknown };
    if (!id || !dados) throw new ErroHttp(400, "Perfil inválido.");
    const db = sql();
    const [existe] = await db`select conta_id from perfis where id = ${id}`;
    if (existe && existe.conta_id !== ctx.conta.id) throw new ErroHttp(403, "Perfil de outra conta.");
    if (!existe) {
      const [{ n }] = await db`select count(*)::int as n from perfis where conta_id = ${ctx.conta.id}::uuid and not apagado`;
      if (n >= ctx.recursos.max_perfis) {
        throw new ErroHttp(403, `Seu plano permite até ${ctx.recursos.max_perfis} perfil(is). Mude de plano para criar mais.`, "plano");
      }
    }
    const [r] = await db`insert into perfis (id, conta_id, dados) values (${id}, ${ctx.conta.id}::uuid, ${db.json(dados as never)})
      on conflict (id) do update set dados = excluded.dados, versao = perfis.versao + 1, atualizado_em = now(), apagado = false
      returning versao, extract(epoch from atualizado_em) as em`;
    return Response.json({ versao: r.versao, em: Number(r.em) });
  } catch (e) {
    return responderErro(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await contexto(req);
    const id = new URL(req.url).searchParams.get("id");
    await sql()`update perfis set apagado = true, atualizado_em = now() where id = ${id} and conta_id = ${ctx.conta.id}::uuid`;
    return Response.json({ ok: true });
  } catch (e) {
    return responderErro(e);
  }
}
