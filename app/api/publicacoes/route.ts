import { conferirCaminho } from "@/lib/servidor/arquivos";
import { ErroHttp, contexto, exigirRecurso, responderErro, sql } from "@/lib/servidor/contexto";
import { avancarPublicacao } from "@/lib/servidor/instagram";

export const runtime = "nodejs";
export const maxDuration = 60;

type Corpo = {
  id: string;
  perfil: string;
  quando: string; // ISO
  tipo: "post" | "carrossel" | "reels" | "story";
  legenda: string;
  midias: { caminho: string; tipo: "imagem" | "video" }[];
  agora?: boolean;
};

// Situação das publicações automáticas de um perfil.
export async function GET(req: Request) {
  try {
    const ctx = await contexto(req);
    const perfil = new URL(req.url).searchParams.get("perfil");
    const linhas = await sql()`select id, status, quando, permalink, erro, atualizado_em from publicacoes
      where conta_id = ${ctx.conta.id}::uuid ${perfil ? sql()`and perfil_id = ${perfil}` : sql()``}
      order by quando desc limit 300`;
    return Response.json({ publicacoes: linhas });
  } catch (e) {
    return responderErro(e);
  }
}

// Agenda (ou reagenda) a publicação automática de um item do calendário.
export async function POST(req: Request) {
  try {
    const ctx = await contexto(req);
    exigirRecurso(!!ctx.recursos.instagram, "A publicação automática no Instagram não está no seu plano.");
    const c = (await req.json()) as Corpo;
    const db = sql();
    const [con] = await db`select 1 from conexoes_instagram where perfil_id = ${c.perfil} and conta_id = ${ctx.conta.id}::uuid`;
    if (!con) throw new ErroHttp(400, "Conecte o Instagram deste perfil em Perfis e redes.");
    if (!c.midias?.length) throw new ErroHttp(400, "O Instagram precisa de pelo menos uma imagem ou vídeo.");
    if (c.tipo === "reels" && c.midias[0].tipo !== "video") throw new ErroHttp(400, "Reels precisa de um vídeo.");
    if (c.tipo === "carrossel" && (c.midias.length < 2 || c.midias.length > 10)) throw new ErroHttp(400, "Carrossel precisa de 2 a 10 mídias.");
    c.midias.forEach((m) => conferirCaminho(ctx, m.caminho));
    const quando = c.agora ? new Date() : new Date(c.quando);
    if (isNaN(quando.getTime())) throw new ErroHttp(400, "Data inválida.");
    const [atual] = await db`select status, conta_id from publicacoes where id = ${c.id}`;
    if (atual && atual.conta_id !== ctx.conta.id) throw new ErroHttp(403, "Publicação de outra conta.");
    if (atual?.status === "publicada") throw new ErroHttp(400, "Este item já foi publicado.");
    await db`insert into publicacoes (id, conta_id, perfil_id, quando, tipo, legenda, midias, status)
      values (${c.id}, ${ctx.conta.id}::uuid, ${c.perfil}, ${quando}, ${c.tipo}, ${c.legenda ?? ""}, ${db.json(c.midias as never)}, 'agendada')
      on conflict (id) do update set quando = excluded.quando, tipo = excluded.tipo, legenda = excluded.legenda, midias = excluded.midias,
        status = 'agendada', tentativas = 0, containers = null, erro = null, atualizado_em = now()`;

    if (c.agora) {
      // Publica na hora (vídeos podem precisar de alguns minutos para o Instagram processar).
      const [p] = await db`update publicacoes set status = 'publicando', tentativas = 1 where id = ${c.id}
        returning id, perfil_id, tipo, legenda, midias, containers, tentativas`;
      try {
        const r = await avancarPublicacao(p as never);
        return Response.json({ status: r === "publicada" ? "publicada" : "publicando" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await db`update publicacoes set status = 'erro', erro = ${msg} where id = ${c.id}`;
        throw new ErroHttp(400, msg);
      }
    }
    return Response.json({ status: "agendada" });
  } catch (e) {
    return responderErro(e);
  }
}

// Cancela a publicação automática (o item continua no calendário).
export async function DELETE(req: Request) {
  try {
    const ctx = await contexto(req);
    const id = new URL(req.url).searchParams.get("id");
    await sql()`update publicacoes set status = 'cancelada', atualizado_em = now()
      where id = ${id} and conta_id = ${ctx.conta.id}::uuid and status in ('agendada','erro')`;
    return Response.json({ ok: true });
  } catch (e) {
    return responderErro(e);
  }
}
