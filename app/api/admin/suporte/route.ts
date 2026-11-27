import { ErroHttp, contexto, responderErro, sql } from "@/lib/servidor/contexto";
import { mensagensDaConversa, textoValido } from "@/lib/servidor/suporte";

export const runtime = "nodejs";

async function exigirAdmin(req: Request) {
  const ctx = await contexto(req);
  if (!ctx.admin) throw new ErroHttp(403, "Somente a equipe da plataforma.");
  return ctx;
}

const equipe = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

// Caixa de entrada, detalhes de uma conversa (com os dados do cliente) e configurações do suporte.
export async function GET(req: Request) {
  try {
    const ctx = await exigirAdmin(req);
    const q = new URL(req.url).searchParams;
    const db = sql();
    if (q.get("resumo")) {
      const [r] = await db`select count(*) filter (where nao_lidas_equipe > 0)::int as nao_lidas,
        count(*) filter (where status = 'aberta')::int as abertas from suporte_conversas`;
      return Response.json(r);
    }
    if (q.get("config")) {
      const tags = await db`select id, nome, cor from suporte_tags order by nome`;
      const respostas = await db`select id, titulo, texto from suporte_respostas order by titulo`;
      return Response.json({ tags, respostas, equipe: equipe(), voce: ctx.email.toLowerCase() });
    }
    const id = q.get("conversa");
    if (id) {
      const [c] = await db`select * from suporte_conversas where id = ${id}::uuid`;
      if (!c) throw new ErroHttp(404, "Conversa não encontrada.");
      await db`update suporte_conversas set nao_lidas_equipe = 0 where id = ${id}::uuid`;
      const [conta] = await db`select c.id, c.nome, c.plano_id, p.nome as plano, c.status, c.saldo, c.criado_em, c.renova_em,
          (select count(*) from perfis where conta_id = c.id and not apagado)::int as perfis,
          (select coalesce(sum(-creditos), 0) from movimentos where conta_id = c.id and tipo = 'uso' and criado_em >= date_trunc('month', now())) as uso_mes,
          (select string_agg(u.email, ', ') from membros m join auth.users u on u.id = m.user_id where m.conta_id = c.id) as emails
        from contas c join planos p on p.id = c.plano_id where c.id = ${c.conta_id}::uuid`;
      const outras = await db`select id, assunto, status, ultima_msg_em from suporte_conversas
        where conta_id = ${c.conta_id}::uuid and id <> ${id}::uuid order by ultima_msg_em desc limit 5`;
      return Response.json({ conversa: { ...c, nao_lidas_equipe: 0 }, mensagens: await mensagensDaConversa(id, true), conta, outras });
    }
    const status = q.get("status");
    const tag = q.get("tag");
    const busca = (q.get("busca") ?? "").trim().toLowerCase();
    const minhas = q.get("minhas") === "1";
    const conversas = await db`select c.id, c.assunto, c.status, c.prioridade, c.responsavel, c.tags, c.email, c.nao_lidas_equipe,
        c.ultima_msg_em, c.criado_em, ct.nome as conta, ct.plano_id,
        (select texto from suporte_mensagens m where m.conversa_id = c.id and m.autor in ('cliente','equipe') order by id desc limit 1) as ultima,
        (select autor from suporte_mensagens m where m.conversa_id = c.id and m.autor in ('cliente','equipe') order by id desc limit 1) as ultimo_autor
      from suporte_conversas c join contas ct on ct.id = c.conta_id
      where true
        ${status ? db`and c.status = ${status}` : db``}
        ${tag ? db`and ${tag} = any(c.tags)` : db``}
        ${minhas ? db`and c.responsavel = ${ctx.email.toLowerCase()}` : db``}
        ${busca ? db`and (lower(c.assunto) like ${"%" + busca + "%"} or lower(coalesce(c.email,'')) like ${"%" + busca + "%"} or lower(ct.nome) like ${"%" + busca + "%"}
            or exists (select 1 from suporte_mensagens m where m.conversa_id = c.id and lower(m.texto) like ${"%" + busca + "%"}))` : db``}
      order by (c.nao_lidas_equipe > 0) desc,
        case c.prioridade when 'urgente' then 0 when 'alta' then 1 when 'normal' then 2 else 3 end, c.ultima_msg_em desc
      limit 200`;
    const [contagem] = await db`select count(*) filter (where status = 'aberta')::int as aberta,
        count(*) filter (where status = 'aguardando')::int as aguardando, count(*) filter (where status = 'resolvida')::int as resolvida
      from suporte_conversas`;
    return Response.json({ conversas, contagem });
  } catch (e) {
    if (String((e as { code?: string }).code) === "42P01") {
      return responderErro(new ErroHttp(503, "Falta rodar a atualização do banco (supabase/migrations/010_suporte.sql)."));
    }
    return responderErro(e);
  }
}

type Corpo =
  | { acao: "responder" | "nota"; conversa: string; texto: string; status?: string }
  | { acao: "atualizar"; conversa: string; status?: string; prioridade?: string; responsavel?: string | null; tags?: string[] }
  | { acao: "tag-criar"; nome: string; cor: string }
  | { acao: "tag-apagar"; id: string }
  | { acao: "resposta-salvar"; id?: string; titulo: string; texto: string }
  | { acao: "resposta-apagar"; id: string };

const STATUS = ["aberta", "aguardando", "resolvida"];
const PRIORIDADES = ["baixa", "normal", "alta", "urgente"];
const NOME_STATUS: Record<string, string> = { aberta: "aberta", aguardando: "aguardando o cliente", resolvida: "resolvida" };

export async function POST(req: Request) {
  try {
    const ctx = await exigirAdmin(req);
    const c = (await req.json()) as Corpo;
    const db = sql();
    const quem = ctx.email.toLowerCase();
    if (c.acao === "responder" || c.acao === "nota") {
      const texto = textoValido(c.texto);
      if (!texto) throw new ErroHttp(400, "Escreva a mensagem.");
      const [ex] = await db`select id, responsavel from suporte_conversas where id = ${c.conversa}::uuid`;
      if (!ex) throw new ErroHttp(404, "Conversa não encontrada.");
      await db`insert into suporte_mensagens (conversa_id, autor, autor_email, texto)
        values (${c.conversa}::uuid, ${c.acao === "nota" ? "nota" : "equipe"}, ${quem}, ${texto})`;
      if (c.acao === "responder") {
        const novo = STATUS.includes(c.status ?? "") ? c.status! : "aguardando";
        await db`update suporte_conversas set nao_lidas_cliente = nao_lidas_cliente + 1, ultima_msg_em = now(), status = ${novo},
          responsavel = coalesce(responsavel, ${quem}) where id = ${c.conversa}::uuid`;
        if (novo === "resolvida") {
          await db`insert into suporte_mensagens (conversa_id, autor, autor_email, texto)
            values (${c.conversa}::uuid, 'sistema', ${quem}, 'Conversa marcada como resolvida.')`;
        }
      }
      return Response.json({ ok: true });
    }
    if (c.acao === "atualizar") {
      const [ex] = await db`select status from suporte_conversas where id = ${c.conversa}::uuid`;
      if (!ex) throw new ErroHttp(404, "Conversa não encontrada.");
      if (c.status !== undefined) {
        if (!STATUS.includes(c.status)) throw new ErroHttp(400, "Status inválido.");
        await db`update suporte_conversas set status = ${c.status} where id = ${c.conversa}::uuid`;
        if (c.status !== ex.status) {
          await db`insert into suporte_mensagens (conversa_id, autor, autor_email, texto)
            values (${c.conversa}::uuid, 'sistema', ${quem}, ${`Conversa marcada como ${NOME_STATUS[c.status]}.`})`;
        }
      }
      if (c.prioridade !== undefined) {
        if (!PRIORIDADES.includes(c.prioridade)) throw new ErroHttp(400, "Prioridade inválida.");
        await db`update suporte_conversas set prioridade = ${c.prioridade} where id = ${c.conversa}::uuid`;
      }
      if (c.responsavel !== undefined) {
        const r = c.responsavel ? c.responsavel.toLowerCase() : null;
        if (r && !equipe().includes(r)) throw new ErroHttp(400, "Responsável precisa ser da equipe.");
        await db`update suporte_conversas set responsavel = ${r} where id = ${c.conversa}::uuid`;
      }
      if (c.tags !== undefined) {
        const validas = (await db`select id from suporte_tags`).map((t) => t.id as string);
        const tags = [...new Set(c.tags)].filter((t) => validas.includes(t)).slice(0, 10);
        await db`update suporte_conversas set tags = ${tags} where id = ${c.conversa}::uuid`;
      }
      return Response.json({ ok: true });
    }
    if (c.acao === "tag-criar") {
      const nome = String(c.nome ?? "").trim().slice(0, 30);
      if (!nome) throw new ErroHttp(400, "Dê um nome para a etiqueta.");
      const id = nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `tag-${Date.now()}`;
      const cor = /^#[0-9a-f]{6}$/i.test(c.cor) ? c.cor : "#8b5cf6";
      await db`insert into suporte_tags (id, nome, cor) values (${id}, ${nome}, ${cor}) on conflict (id) do update set nome = excluded.nome, cor = excluded.cor`;
      return Response.json({ ok: true, id });
    }
    if (c.acao === "tag-apagar") {
      await db`delete from suporte_tags where id = ${c.id}`;
      await db`update suporte_conversas set tags = array_remove(tags, ${c.id}) where ${c.id} = any(tags)`;
      return Response.json({ ok: true });
    }
    if (c.acao === "resposta-salvar") {
      const titulo = String(c.titulo ?? "").trim().slice(0, 60), texto = textoValido(c.texto);
      if (!titulo || !texto) throw new ErroHttp(400, "Preencha o título e o texto.");
      if (c.id) await db`update suporte_respostas set titulo = ${titulo}, texto = ${texto} where id = ${c.id}::uuid`;
      else await db`insert into suporte_respostas (titulo, texto) values (${titulo}, ${texto})`;
      return Response.json({ ok: true });
    }
    if (c.acao === "resposta-apagar") {
      await db`delete from suporte_respostas where id = ${c.id}::uuid`;
      return Response.json({ ok: true });
    }
    throw new ErroHttp(400, "Ação inválida.");
  } catch (e) {
    return responderErro(e);
  }
}
