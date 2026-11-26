import { ErroHttp, contexto, responderErro, sql } from "@/lib/servidor/contexto";
import { credencialDaPlataforma, listarMarcas } from "@/lib/servidor/metricool";
import { perfisComPublicacao } from "@/lib/servidor/cota";

export const runtime = "nodejs";

async function exigirAdmin(req: Request) {
  const ctx = await contexto(req);
  if (!ctx.admin) throw new ErroHttp(403, "Somente administradores.");
  return ctx;
}

// Perfis de uma conta, a marca do Metricool de cada um e as marcas da conta Metricool da plataforma.
export async function GET(req: Request) {
  try {
    await exigirAdmin(req);
    const conta = new URL(req.url).searchParams.get("conta");
    const db = sql();
    const perfis = await db`select id, dados->>'nome' as nome, dados->>'arroba' as arroba from perfis where conta_id = ${conta}::uuid and not apagado order by atualizado_em`;
    const mapa = await db`select perfil_id, blog_id, nome, origem, link_conexao from metricool_marcas where conta_id = ${conta}::uuid`;
    const cred = credencialDaPlataforma();
    let marcas: Awaited<ReturnType<typeof listarMarcas>> = [];
    let erro: string | null = cred ? null : "O Metricool da plataforma ainda não foi configurado (METRICOOL_USER_TOKEN e METRICOOL_USER_ID).";
    if (cred) marcas = await listarMarcas(cred).catch((e) => ((erro = String(e.message)), []));
    return Response.json({ perfis, mapa, marcas, erro });
  } catch (e) {
    return responderErro(e);
  }
}

// Define (ou remove) a marca do Metricool da plataforma para um perfil e o link de conexão para o cliente.
export async function POST(req: Request) {
  try {
    await exigirAdmin(req);
    const c = (await req.json()) as { conta: string; perfil: string; blogId?: string; nome?: string; link?: string };
    const db = sql();
    if (!c.blogId) {
      await db`delete from metricool_marcas where perfil_id = ${c.perfil} and origem = 'plataforma'`;
      return Response.json({ ok: true });
    }
    const [lim] = await db`select coalesce((c.recursos_custom->>'perfis_publicacao')::int, (p.recursos->>'perfis_publicacao')::int, 0) as n, p.nome
      from contas c join planos p on p.id = c.plano_id where c.id = ${c.conta}::uuid`;
    if ((await perfisComPublicacao(c.conta, c.perfil)) >= Number(lim?.n ?? 0)) {
      throw new ErroHttp(400, `O plano ${lim?.nome ?? ""} desta conta permite publicação automática em ${lim?.n ?? 0} perfil(is). Mude o plano da conta ou tire a marca de outro perfil.`);
    }
    await db`insert into metricool_marcas (perfil_id, conta_id, blog_id, nome, origem, link_conexao)
      values (${c.perfil}, ${c.conta}::uuid, ${c.blogId}, ${c.nome ?? null}, 'plataforma', ${c.link?.trim() || null})
      on conflict (perfil_id) do update set conta_id = excluded.conta_id, blog_id = excluded.blog_id, nome = excluded.nome,
        origem = 'plataforma', link_conexao = excluded.link_conexao, atualizado_em = now()`;
    return Response.json({ ok: true });
  } catch (e) {
    return responderErro(e);
  }
}
