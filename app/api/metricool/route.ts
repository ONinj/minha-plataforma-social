import { ErroHttp, contexto, responderErro, sql } from "@/lib/servidor/contexto";
import { credencialDaConta, listarMarcas, plataformaConfigurada, salvarCredencialPropria } from "@/lib/servidor/metricool";

export const runtime = "nodejs";

/**
 * Situação do Metricool para a conta: se a plataforma tem Metricool, se a conta usa o próprio,
 * quais perfis já têm marca (e o link para conectar as redes) e, para quem usa o próprio, a lista de marcas.
 */
export async function GET(req: Request) {
  try {
    const ctx = await contexto(req);
    const db = sql();
    const [propria] = await db`select user_id from metricool_contas where conta_id = ${ctx.conta.id}::uuid`;
    const marcas = await db`select perfil_id, blog_id, nome, origem, link_conexao from metricool_marcas where conta_id = ${ctx.conta.id}::uuid`;
    let disponiveis: Awaited<ReturnType<typeof listarMarcas>> = [];
    let erro: string | null = null;
    if (propria) {
      try {
        disponiveis = await listarMarcas((await credencialDaConta(ctx.conta.id))!);
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e);
      }
    }
    return Response.json({ plataforma: plataformaConfigurada(), propria: !!propria, marcas, disponiveis, erro });
  } catch (e) {
    return responderErro(e);
  }
}

type Corpo =
  | { acao: "credenciais"; userId: string; token: string }
  | { acao: "remover-credenciais" }
  | { acao: "marca"; perfil: string; blogId: string; nome?: string }
  | { acao: "remover-marca"; perfil: string };

export async function POST(req: Request) {
  try {
    const ctx = await contexto(req);
    if (ctx.papel !== "dono") throw new ErroHttp(403, "Só o dono da conta pode mudar a configuração do Metricool.");
    const c = (await req.json()) as Corpo;
    const db = sql();
    if (c.acao === "credenciais") {
      const cred = { userId: c.userId.trim(), token: c.token.trim(), origem: "propria" as const };
      const marcas = await listarMarcas(cred).catch((e) => {
        throw new ErroHttp(400, `Não consegui entrar no seu Metricool: ${e instanceof Error ? e.message : e}`);
      });
      await salvarCredencialPropria(ctx.conta.id, cred.userId, cred.token);
      return Response.json({ ok: true, marcas });
    }
    if (c.acao === "remover-credenciais") {
      await db`delete from metricool_contas where conta_id = ${ctx.conta.id}::uuid`;
      await db`delete from metricool_marcas where conta_id = ${ctx.conta.id}::uuid and origem = 'propria'`;
      return Response.json({ ok: true });
    }
    if (c.acao === "marca") {
      // Só com o Metricool próprio: o cliente escolhe uma das marcas dele.
      const cred = await credencialDaConta(ctx.conta.id);
      if (cred?.origem !== "propria") throw new ErroHttp(403, "A marca do Metricool da plataforma é definida pela equipe.");
      const marcas = await listarMarcas(cred);
      const m = marcas.find((x) => x.blogId === c.blogId);
      if (!m) throw new ErroHttp(400, "Marca não encontrada no seu Metricool.");
      await db`insert into metricool_marcas (perfil_id, conta_id, blog_id, nome, origem) values (${c.perfil}, ${ctx.conta.id}::uuid, ${m.blogId}, ${m.nome}, 'propria')
        on conflict (perfil_id) do update set conta_id = excluded.conta_id, blog_id = excluded.blog_id, nome = excluded.nome, origem = 'propria', atualizado_em = now()`;
      return Response.json({ ok: true });
    }
    if (c.acao === "remover-marca") {
      await db`delete from metricool_marcas where perfil_id = ${c.perfil} and conta_id = ${ctx.conta.id}::uuid and origem = 'propria'`;
      return Response.json({ ok: true });
    }
    throw new ErroHttp(400, "Ação inválida.");
  } catch (e) {
    return responderErro(e);
  }
}
