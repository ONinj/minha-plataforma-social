import { clienteFal, enviarImagemFal, mensagemErroFal, statusErroFal } from "@/lib/fal";
import { conferirCaminho, linkDeLeitura } from "@/lib/servidor/arquivos";
import {
  MODO_NUVEM,
  comSaldo,
  contexto,
  debitar,
  exigirRecurso,
  exigirSaldo,
  responderErro,
  usdParaCreditos,
  type Contexto,
} from "@/lib/servidor/contexto";

export const runtime = "nodejs";
export const maxDuration = 60;

type Corpo = {
  familia: "seedance" | "veo";
  modelo: string; // ex.: "bytedance/seedance-2.5" ou "fal-ai/veo3.1/fast"
  prompt: string;
  titulo?: string;
  imagem?: { mimeType: string; base64: string };
  resolucao?: string;
  duracao?: string;
  proporcao?: string;
  /** Modo local: vídeo de referência já enviado ao fal.ai (só Seedance). */
  videoReferenciaUrl?: string;
  /** Modo nuvem: vídeo de referência no armazenamento da conta. */
  videoReferenciaCaminho?: string;
  segundosReferencia?: number;
};

/** Custo estimado do vídeo em dólares (cobrado ao enviar; devolvido se falhar). */
function custoVideo(ctx: Contexto, c: Corpo): number {
  const p = ctx.precos;
  if (c.familia === "veo") return (p.veo_por_segundo[c.modelo] ?? 0.4) * p.segundos_veo;
  const porSeg = p.seedance_por_segundo[c.resolucao ?? "720p"] ?? 0.47;
  const seg = Number(c.duracao) || p.segundos_seedance;
  const ref = c.videoReferenciaCaminho ? (c.segundosReferencia ?? 10) * porSeg * p.seedance_referencia_fator : 0;
  return porSeg * seg + ref;
}

// Envia um pedido de vídeo (Seedance ou Veo) para a fila do fal.ai e devolve o id do pedido.
export async function POST(req: Request) {
  let ctx: Contexto | null = null;
  try {
    const c = (await req.json()) as Corpo;
    let usd = 0;
    if (MODO_NUVEM) {
      ctx = await contexto(req);
      if (c.familia === "veo") exigirRecurso(ctx.recursos.veo.includes(c.modelo), "Este modelo do Veo não está no seu plano.");
      else {
        exigirRecurso(ctx.recursos.seedance, "O Seedance não está no seu plano.");
        const res = ctx.recursos.seedance_resolucoes;
        exigirRecurso(!res || res.includes(c.resolucao ?? "720p"), `O Seedance em ${c.resolucao ?? "720p"} não está no seu plano. Escolha outra resolução em Configurações.`);
      }
      if (c.videoReferenciaCaminho) {
        exigirRecurso(ctx.recursos.biblioteca, "Vídeo de referência da biblioteca não está no seu plano.");
        conferirCaminho(ctx, c.videoReferenciaCaminho);
      }
      usd = custoVideo(ctx, c);
      exigirSaldo(ctx, usdParaCreditos(ctx, usd));
    }
    const fal = clienteFal(req);
    if (!fal) return Response.json({ error: "Chave do fal.ai não configurada." }, { status: 400 });

    const input: Record<string, unknown> = { prompt: c.prompt };
    if (c.resolucao) input.resolution = c.resolucao;
    if (c.duracao) input.duration = c.duracao;

    const referencia = c.videoReferenciaCaminho ? await linkDeLeitura(c.videoReferenciaCaminho, 6 * 3600) : c.videoReferenciaUrl;
    let endpoint: string;
    if (referencia) {
      // Seedance "reference-to-video": anima a partir de um vídeo (e opcionalmente uma imagem).
      endpoint = `${c.modelo}/reference-to-video`;
      input.video_urls = [referencia];
      if (c.imagem) input.image_urls = [await enviarImagemFal(fal, c.imagem)];
      if (c.proporcao) input.aspect_ratio = c.proporcao;
    } else if (c.imagem) {
      endpoint = `${c.modelo}/image-to-video`;
      input.image_url = await enviarImagemFal(fal, c.imagem);
      // No Seedance com imagem a proporção segue a da imagem.
      if (c.familia === "veo" && c.proporcao) input.aspect_ratio = c.proporcao;
    } else {
      endpoint = c.familia === "seedance" ? `${c.modelo}/text-to-video` : c.modelo;
      if (c.proporcao) input.aspect_ratio = c.proporcao;
    }

    let requestId: string;
    try {
      requestId = (await fal.queue.submit(endpoint, { input })).request_id;
    } catch (erro) {
      // Se o modelo recusar a proporção, tenta de novo deixando no automático.
      if (statusErroFal(erro) !== 422 || !("aspect_ratio" in input)) throw erro;
      delete input.aspect_ratio;
      requestId = (await fal.queue.submit(endpoint, { input })).request_id;
    }

    if (ctx) {
      const nome = c.familia === "veo" ? "Vídeo Veo" : "Vídeo Seedance";
      await debitar(ctx, usdParaCreditos(ctx, usd), `${nome}${c.titulo ? ` · ${c.titulo}` : ""}`, {
        ref: requestId,
        custoUsd: usd,
        permitirNegativo: true,
      });
    }
    return comSaldo(Response.json({ endpoint, requestId }), ctx);
  } catch (erro) {
    if (erro && typeof erro === "object" && "body" in erro) {
      return Response.json({ error: `Erro do fal.ai: ${mensagemErroFal(erro)}` }, { status: 500 });
    }
    return responderErro(erro);
  }
}
