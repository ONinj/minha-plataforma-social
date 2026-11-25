import { conferirCaminho, linkDeLeitura } from "@/lib/servidor/arquivos";
import { ErroHttp, contexto, exigirRecurso, responderErro, sql } from "@/lib/servidor/contexto";
import { avancarPublicacao } from "@/lib/servidor/instagram";
import * as metricool from "@/lib/servidor/metricool";

export const runtime = "nodejs";
export const maxDuration = 60;

type Corpo = {
  id: string;
  perfil: string;
  quando: string; // ISO
  tipo: "post" | "carrossel" | "reels" | "story";
  legenda: string;
  midias: { caminho: string; tipo: "imagem" | "video" }[];
  redes?: string[];
  agora?: boolean;
};

const SEM_PLANO = "A publicação automática não está no seu plano.";

/** Pergunta ao Metricool como estão os posts que já passaram da hora (no máximo 10 por vez). */
async function atualizarMetricool(contaId: string, perfil: string | null) {
  const db = sql();
  const pendentes = await db`select p.id, p.perfil_id, p.externo_id from publicacoes p
    where p.conta_id = ${contaId}::uuid and p.via = 'metricool' and p.status = 'agendada' and p.externo_id is not null
      and p.quando <= now() + interval '1 minute' ${perfil ? db`and p.perfil_id = ${perfil}` : db``}
      and p.atualizado_em < now() - interval '1 minute'
    order by p.quando limit 10`;
  await Promise.all(
    pendentes.map(async (p) => {
      try {
        const m = await metricool.marcaDoPerfil(p.perfil_id, contaId);
        if (!m) return;
        const r = await metricool.consultar(m.cred, m.blogId, p.externo_id);
        if (r.status === "publicada") await db`update publicacoes set status = 'publicada', permalink = ${r.link ?? null}, erro = null, atualizado_em = now() where id = ${p.id}`;
        else if (r.status === "erro") await db`update publicacoes set status = 'erro', erro = ${r.erro ?? null}, atualizado_em = now() where id = ${p.id}`;
        else await db`update publicacoes set atualizado_em = now() where id = ${p.id}`;
      } catch (e) {
        console.warn("Metricool: não consegui consultar", p.id, e);
      }
    }),
  );
}

// Situação das publicações automáticas de um perfil.
export async function GET(req: Request) {
  try {
    const ctx = await contexto(req);
    const perfil = new URL(req.url).searchParams.get("perfil");
    await atualizarMetricool(ctx.conta.id, perfil).catch((e) => console.warn("Metricool", e));
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
    const c = (await req.json()) as Corpo;
    const db = sql();
    if (!c.midias?.length) throw new ErroHttp(400, "A publicação precisa de pelo menos uma imagem ou vídeo.");
    if (c.tipo === "reels" && c.midias[0].tipo !== "video") throw new ErroHttp(400, "Reels precisa de um vídeo.");
    if (c.tipo === "carrossel" && (c.midias.length < 2 || c.midias.length > 10)) throw new ErroHttp(400, "Carrossel precisa de 2 a 10 mídias.");
    c.midias.forEach((m) => conferirCaminho(ctx, m.caminho));
    const [atual] = await db`select status, conta_id, via, externo_id from publicacoes where id = ${c.id}`;
    if (atual && atual.conta_id !== ctx.conta.id) throw new ErroHttp(403, "Publicação de outra conta.");
    if (atual?.status === "publicada") throw new ErroHttp(400, "Este item já foi publicado.");

    // 1) Perfil ligado a uma marca do Metricool: o Metricool publica sozinho na hora.
    const mc = await metricool.marcaDoPerfil(c.perfil, ctx.conta.id);
    if (mc) {
      // Com o Metricool próprio a pessoa já paga o Metricool dela; com o da plataforma, depende do plano.
      if (mc.cred.origem === "plataforma") exigirRecurso(!!ctx.recursos.instagram, SEM_PLANO);
      // O Metricool não aceita horário no passado: "agora" vira daqui a 2 minutos.
      const minimo = Date.now() + 2 * 60_000;
      const pedido = c.agora ? minimo : new Date(c.quando).getTime();
      if (isNaN(pedido)) throw new ErroHttp(400, "Data inválida.");
      if (pedido < Date.now() - 60_000) throw new ErroHttp(400, "Essa data já passou. Escolha um horário futuro ou use “Publicar agora”.");
      const quando = new Date(Math.max(pedido, minimo));
      // Links das mídias válidos até 3 dias depois da publicação (o Metricool baixa os arquivos).
      const validade = Math.ceil((quando.getTime() - Date.now()) / 1000) + 3 * 86400;
      const urls = await Promise.all(c.midias.map((m) => linkDeLeitura(m.caminho, validade)));
      if (atual?.via === "metricool" && atual.externo_id && atual.status === "agendada") {
        await metricool.cancelar(mc.cred, mc.blogId, atual.externo_id).catch(() => {});
      }
      let externo: string;
      try {
        externo = await metricool.agendar(mc.cred, mc.blogId, {
          quando: quando.toISOString(),
          tipo: c.tipo,
          legenda: c.legenda ?? "",
          midias: urls,
          redes: c.redes?.length ? c.redes : ["Instagram"],
        });
      } catch (e) {
        throw new ErroHttp(400, e instanceof Error ? e.message : String(e));
      }
      await db`insert into publicacoes (id, conta_id, perfil_id, quando, tipo, legenda, midias, status, via, externo_id)
        values (${c.id}, ${ctx.conta.id}::uuid, ${c.perfil}, ${quando}, ${c.tipo}, ${c.legenda ?? ""}, ${db.json(c.midias as never)}, 'agendada', 'metricool', ${externo})
        on conflict (id) do update set quando = excluded.quando, tipo = excluded.tipo, legenda = excluded.legenda, midias = excluded.midias,
          status = 'agendada', via = 'metricool', externo_id = excluded.externo_id, tentativas = 0, containers = null, erro = null, atualizado_em = now()`;
      return Response.json({ status: "agendada", via: "metricool" });
    }

    // 2) Instagram conectado direto pela API oficial da Meta.
    exigirRecurso(!!ctx.recursos.instagram, SEM_PLANO);
    const [con] = await db`select 1 from conexoes_instagram where perfil_id = ${c.perfil} and conta_id = ${ctx.conta.id}::uuid`;
    if (!con) throw new ErroHttp(400, "Este perfil ainda não está conectado para publicar (veja Perfis e redes).");
    const quando = c.agora ? new Date() : new Date(c.quando);
    if (isNaN(quando.getTime())) throw new ErroHttp(400, "Data inválida.");
    await db`insert into publicacoes (id, conta_id, perfil_id, quando, tipo, legenda, midias, status, via)
      values (${c.id}, ${ctx.conta.id}::uuid, ${c.perfil}, ${quando}, ${c.tipo}, ${c.legenda ?? ""}, ${db.json(c.midias as never)}, 'agendada', 'instagram')
      on conflict (id) do update set quando = excluded.quando, tipo = excluded.tipo, legenda = excluded.legenda, midias = excluded.midias,
        status = 'agendada', via = 'instagram', externo_id = null, tentativas = 0, containers = null, erro = null, atualizado_em = now()`;

    if (c.agora) {
      // Publica na hora (vídeos podem precisar de alguns minutos para o Instagram processar).
      const [p] = await db`update publicacoes set status = 'publicando', tentativas = 1 where id = ${c.id}
        returning id, perfil_id, tipo, legenda, midias, containers, tentativas`;
      try {
        const r = await avancarPublicacao(p as never);
        return Response.json({ status: r === "publicada" ? "publicada" : "publicando", via: "instagram" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await db`update publicacoes set status = 'erro', erro = ${msg} where id = ${c.id}`;
        throw new ErroHttp(400, msg);
      }
    }
    return Response.json({ status: "agendada", via: "instagram" });
  } catch (e) {
    return responderErro(e);
  }
}

// Cancela a publicação automática (o item continua no calendário).
export async function DELETE(req: Request) {
  try {
    const ctx = await contexto(req);
    const id = new URL(req.url).searchParams.get("id");
    const db = sql();
    const [p] = await db`select perfil_id, via, externo_id, status from publicacoes where id = ${id} and conta_id = ${ctx.conta.id}::uuid`;
    if (p?.via === "metricool" && p.externo_id && p.status === "agendada") {
      const m = await metricool.marcaDoPerfil(p.perfil_id, ctx.conta.id);
      if (m) {
        try {
          await metricool.cancelar(m.cred, m.blogId, p.externo_id);
        } catch (e) {
          throw new ErroHttp(400, `Não consegui cancelar no Metricool: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
    await db`update publicacoes set status = 'cancelada', atualizado_em = now()
      where id = ${id} and conta_id = ${ctx.conta.id}::uuid and status in ('agendada','erro')`;
    return Response.json({ ok: true });
  } catch (e) {
    return responderErro(e);
  }
}
