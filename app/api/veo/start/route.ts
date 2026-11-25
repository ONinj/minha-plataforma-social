import { GOOGLE_BASE, chaveGoogle, repassarErroGoogle } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 60;

type Corpo = {
  model: string;
  prompt: string;
  aspectRatio?: string;
  negativePrompt?: string;
  imagem?: { mimeType: string; base64: string };
};

// Inicia a geração de um vídeo no Veo. Devolve o nome da operação para acompanhar.
export async function POST(req: Request) {
  const chave = chaveGoogle(req);
  if (!chave) return Response.json({ error: "Chave do Google não configurada." }, { status: 400 });

  const c = (await req.json()) as Corpo;
  const parameters: Record<string, unknown> = {};
  if (c.aspectRatio) parameters.aspectRatio = c.aspectRatio;
  if (c.negativePrompt) parameters.negativePrompt = c.negativePrompt;

  // A API do Gemini aceita a imagem inicial em dois formatos conforme a versão;
  // tenta o atual e, se recusar, o formato alternativo.
  const formatosImagem = c.imagem
    ? [
        { inlineData: { mimeType: c.imagem.mimeType, data: c.imagem.base64 } },
        { bytesBase64Encoded: c.imagem.base64, mimeType: c.imagem.mimeType },
      ]
    : [undefined];

  let ultimaResposta: Response | null = null;
  for (const image of formatosImagem) {
    const instance: Record<string, unknown> = { prompt: c.prompt };
    if (image) instance.image = image;
    const resp = await fetch(`${GOOGLE_BASE}/models/${encodeURIComponent(c.model)}:predictLongRunning`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({ instances: [instance], parameters }),
    });
    if (resp.ok) {
      const j = await resp.json();
      return Response.json({ operacao: j.name });
    }
    ultimaResposta = resp;
    if (resp.status !== 400) break;
  }
  return repassarErroGoogle(ultimaResposta!);
}
