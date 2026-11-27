import { hashToken, novoToken } from "@/lib/servidor/aprovacao";
import { ErroHttp, contexto, responderErro, sql } from "@/lib/servidor/contexto";

export const runtime = "nodejs";

// Quem trabalha na conta e os convites que ainda não foram aceitos.
export async function GET(req: Request) {
  try {
    const ctx = await contexto(req);
    const db = sql();
    const membros = await db`select m.user_id, m.papel, m.criado_em, u.email from membros m
      left join auth.users u on u.id = m.user_id where m.conta_id = ${ctx.conta.id}::uuid order by m.criado_em`;
    const convites = ctx.papel === "dono"
      ? await db`select id, email, criado_em, expira_em from convites
          where conta_id = ${ctx.conta.id}::uuid and aceito_em is null and not cancelado and expira_em > now() order by criado_em desc`
      : [];
    return Response.json({ membros, convites, limite: ctx.recursos.max_membros ?? 1, voce: ctx.userId, papel: ctx.papel });
  } catch (e) {
    return responderErro(e);
  }
}

type Corpo =
  | { acao: "convidar"; email: string }
  | { acao: "cancelar-convite"; id: string }
  | { acao: "remover"; userId: string }
  | { acao: "sair" };

export async function POST(req: Request) {
  try {
    const ctx = await contexto(req);
    const c = (await req.json()) as Corpo;
    const db = sql();
    if (c.acao === "sair") {
      if (ctx.papel === "dono") throw new ErroHttp(400, "O dono não pode sair da própria conta.");
      await db`delete from membros where conta_id = ${ctx.conta.id}::uuid and user_id = ${ctx.userId}::uuid and papel <> 'dono'`;
      return Response.json({ ok: true });
    }
    if (ctx.papel !== "dono") throw new ErroHttp(403, "Só o dono da conta gerencia a equipe.");
    if (c.acao === "convidar") {
      const email = String(c.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new ErroHttp(400, "E-mail inválido.");
      const limite = ctx.recursos.max_membros ?? 1;
      const [{ n }] = await db`select (select count(*) from membros where conta_id = ${ctx.conta.id}::uuid)
        + (select count(*) from convites where conta_id = ${ctx.conta.id}::uuid and aceito_em is null and not cancelado and expira_em > now()) as n`;
      if (Number(n) >= limite) {
        throw new ErroHttp(403, limite <= 1 ? "Seu plano não inclui equipe. A partir do Profissional você pode convidar pessoas." : `Seu plano permite até ${limite} pessoas na conta (com você).`, "plano");
      }
      const [ja] = await db`select 1 from membros m join auth.users u on u.id = m.user_id
        where m.conta_id = ${ctx.conta.id}::uuid and lower(u.email) = ${email}`;
      if (ja) throw new ErroHttp(400, "Essa pessoa já faz parte da equipe.");
      const token = novoToken();
      await db`update convites set cancelado = true where conta_id = ${ctx.conta.id}::uuid and email = ${email} and aceito_em is null`;
      const [cv] = await db`insert into convites (conta_id, email, token_hash, criado_por, expira_em)
        values (${ctx.conta.id}::uuid, ${email}, ${hashToken(token)}, ${ctx.userId}::uuid, now() + interval '7 days') returning id, expira_em`;
      return Response.json({ id: cv.id, url: `${new URL(req.url).origin}/convite/${token}`, expira_em: cv.expira_em });
    }
    if (c.acao === "cancelar-convite") {
      await db`update convites set cancelado = true where id = ${c.id}::uuid and conta_id = ${ctx.conta.id}::uuid`;
      return Response.json({ ok: true });
    }
    if (c.acao === "remover") {
      if (c.userId === ctx.userId) throw new ErroHttp(400, "Você não pode remover a si mesmo.");
      await db`delete from membros where conta_id = ${ctx.conta.id}::uuid and user_id = ${c.userId}::uuid and papel <> 'dono'`;
      return Response.json({ ok: true });
    }
    throw new ErroHttp(400, "Ação inválida.");
  } catch (e) {
    if (String((e as { code?: string }).code) === "42P01") {
      return responderErro(new ErroHttp(503, "Falta rodar a atualização do banco (supabase/migrations/009_equipe.sql)."));
    }
    return responderErro(e);
  }
}
