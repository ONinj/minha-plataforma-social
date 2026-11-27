import { conferirCaminho } from "@/lib/servidor/arquivos";
import { ErroHttp, contexto, responderErro, sql } from "@/lib/servidor/contexto";
import { LIMITE_TEXTO, mensagensDaConversa, textoValido } from "@/lib/servidor/suporte";

export const runtime = "nodejs";

// Conversas de suporte de quem está logado (ou as mensagens de uma delas).
export async function GET(req: Request) {
  try {
    const ctx = await contexto(req);
    const q = new URL(req.url).searchParams;
    const db = sql();
    if (q.get("resumo")) {
      const [r] = await db`select coalesce(sum(nao_lidas_cliente), 0)::int as nao_lidas from suporte_conversas where user_id = ${ctx.userId}::uuid`;
      return Response.json({ nao_lidas: r.nao_lidas });
    }
    const id = q.get("conversa");
    if (id) {
      const [c] = await db`select id, assunto, status from suporte_conversas where id = ${id}::uuid and user_id = ${ctx.userId}::uuid`;
      if (!c) throw new ErroHttp(404, "Conversa não encontrada.");
      await db`update suporte_conversas set nao_lidas_cliente = 0 where id = ${id}::uuid`;
      return Response.json({ conversa: c, mensagens: await mensagensDaConversa(id, false) });
    }
    const conversas = await db`select c.id, c.assunto, c.status, c.nao_lidas_cliente, c.ultima_msg_em,
        (select texto from suporte_mensagens m where m.conversa_id = c.id and m.autor <> 'nota' order by id desc limit 1) as ultima
      from suporte_conversas c where c.user_id = ${ctx.userId}::uuid order by c.ultima_msg_em desc limit 50`;
    return Response.json({ conversas });
  } catch (e) {
    if (String((e as { code?: string }).code) === "42P01") return Response.json({ conversas: [], nao_lidas: 0 });
    return responderErro(e);
  }
}

type Corpo = { acao: "nova"; assunto: string; texto: string; anexo?: string } | { acao: "enviar"; conversa: string; texto: string; anexo?: string };

export async function POST(req: Request) {
  try {
    const ctx = await contexto(req);
    const c = (await req.json()) as Corpo;
    const db = sql();
    const texto = textoValido(c.texto);
    if (!texto) throw new ErroHttp(400, `Escreva a mensagem (até ${LIMITE_TEXTO} caracteres).`);
    if (c.anexo) conferirCaminho(ctx, c.anexo);
    // Proteção contra abuso: até 40 mensagens por hora por pessoa.
    const [{ n }] = await db`select count(*)::int as n from suporte_mensagens m join suporte_conversas c on c.id = m.conversa_id
      where c.user_id = ${ctx.userId}::uuid and m.autor = 'cliente' and m.criado_em > now() - interval '1 hour'`;
    if (n >= 40) throw new ErroHttp(429, "Muitas mensagens em pouco tempo. Espere um pouco e tente de novo.");
    let conversa: string;
    if (c.acao === "nova") {
      const assunto = String(c.assunto ?? "").trim().slice(0, 120) || texto.slice(0, 60);
      const [nova] = await db`insert into suporte_conversas (conta_id, user_id, email, assunto, nao_lidas_equipe)
        values (${ctx.conta.id}::uuid, ${ctx.userId}::uuid, ${ctx.email}, ${assunto}, 1) returning id`;
      conversa = nova.id;
    } else if (c.acao === "enviar") {
      const [ex] = await db`select id from suporte_conversas where id = ${c.conversa}::uuid and user_id = ${ctx.userId}::uuid`;
      if (!ex) throw new ErroHttp(404, "Conversa não encontrada.");
      conversa = ex.id;
      await db`update suporte_conversas set nao_lidas_equipe = nao_lidas_equipe + 1, ultima_msg_em = now(),
        status = 'aberta' where id = ${conversa}::uuid`;
    } else throw new ErroHttp(400, "Ação inválida.");
    await db`insert into suporte_mensagens (conversa_id, autor, autor_email, texto, anexo)
      values (${conversa}::uuid, 'cliente', ${ctx.email}, ${texto}, ${c.anexo ?? null})`;
    return Response.json({ ok: true, conversa });
  } catch (e) {
    if (String((e as { code?: string }).code) === "42P01") {
      return responderErro(new ErroHttp(503, "O suporte ainda está sendo ativado. Fale com a gente pelo WhatsApp."));
    }
    return responderErro(e);
  }
}
