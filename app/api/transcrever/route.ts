import { createFalClient } from "@fal-ai/client";
import { conferirCaminho, duracaoDoVideo, linkDeLeitura, tamanhoDoArquivo } from "@/lib/servidor/arquivos";
import { MODO_NUVEM, ErroHttp, acertar, comSaldo, contexto, reservar, responderErro, usdParaCreditos, type Contexto } from "@/lib/servidor/contexto";

export const runtime = "nodejs";
export const maxDuration = 300;

type Trecho = { inicio: number; fim: number; texto: string };

/**
 * Transcreve um vídeo/áudio com o tempo de cada palavra (Whisper no fal.ai), para o editor cortar e legendar.
 * Nuvem: arquivo no armazenamento da conta (cobrado pela duração medida). Local: link do fal.ai e a chave da pessoa.
 */
export async function POST(req: Request) {
  let ctx: Contexto | null = null;
  let reserva: { ref: string } | null = null;
  try {
    const c = (await req.json()) as { caminho?: string; url?: string; segundos?: number };
    let url: string;
    let creditos = 0;
    let usd = 0;
    if (MODO_NUVEM) {
      ctx = await contexto(req);
      if (!c.caminho) throw new ErroHttp(400, "Arquivo não informado.");
      conferirCaminho(ctx, c.caminho);
      const medida = await duracaoDoVideo(c.caminho);
      const bytes = await tamanhoDoArquivo(c.caminho);
      if (bytes && bytes > 300 * 1024 * 1024) throw new ErroHttp(400, "Vídeo grande demais (máximo 300 MB).");
      // Sem conseguir medir, estima pelo tamanho (vídeo de celular ~1 MB a cada 2 s), com teto de 10 min.
      const seg = Math.min(600, Math.max(5, medida ?? (bytes ? bytes / 500_000 : 120)));
      usd = (seg / 60) * ctx.precos.whisper_por_minuto;
      creditos = usdParaCreditos(ctx, usd);
      reserva = await reservar(ctx, { max: creditos, minimo: creditos, descricao: "Transcrição para o editor" });
      url = await linkDeLeitura(c.caminho, 3600);
    } else {
      if (!c.url?.startsWith("https://")) throw new ErroHttp(400, "Arquivo não informado.");
      url = c.url;
    }
    const chave = MODO_NUVEM ? process.env.FAL_KEY : req.headers.get("x-fal-key");
    if (!chave) throw new ErroHttp(400, "Chave do fal.ai não configurada.");
    const fal = createFalClient({ credentials: chave });

    let dados: { text?: string; chunks?: { timestamp?: [number, number | null]; text?: string }[] };
    try {
      dados = (await fal.subscribe("fal-ai/whisper", { input: { audio_url: url, task: "transcribe", language: "pt", chunk_level: "word" } })).data as typeof dados;
    } catch {
      dados = (await fal.subscribe("fal-ai/whisper", { input: { audio_url: url, task: "transcribe", language: "pt" } })).data as typeof dados;
    }
    const trechos: Trecho[] = (dados.chunks ?? [])
      .map((k) => ({ inicio: Number(k.timestamp?.[0] ?? 0), fim: Number(k.timestamp?.[1] ?? k.timestamp?.[0] ?? 0), texto: String(k.text ?? "").trim() }))
      .filter((t) => t.texto);
    if (ctx && reserva) await acertar(ctx, reserva.ref, creditos, { custoUsd: usd, descricao: "Transcrição para o editor" });
    return comSaldo(Response.json({ texto: String(dados.text ?? "").trim(), trechos }), ctx);
  } catch (e) {
    if (ctx && reserva) await acertar(ctx, reserva.ref, 0).catch(() => {});
    return responderErro(e);
  }
}
