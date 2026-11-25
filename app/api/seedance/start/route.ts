import { createFalClient } from "@fal-ai/client";

export const runtime = "nodejs";
export const maxDuration = 60;

type Corpo = {
  prefixo: string; // ex.: "bytedance/seedance-2.5"
  prompt: string;
  imagem?: { mimeType: string; base64: string };
  resolucao?: string;
  duracao?: string;
  proporcao?: string;
};

// Envia um pedido de vídeo para o Seedance (fal.ai) e devolve o id da fila.
export async function POST(req: Request) {
  const chave = req.headers.get("x-fal-key");
  if (!chave) return Response.json({ error: "Chave do fal.ai não configurada." }, { status: 400 });

  const c = (await req.json()) as Corpo;
  const fal = createFalClient({ credentials: chave });

  try {
    const input: Record<string, unknown> = { prompt: c.prompt };
    if (c.resolucao) input.resolution = c.resolucao;
    if (c.duracao) input.duration = c.duracao;

    let endpoint: string;
    if (c.imagem) {
      endpoint = `${c.prefixo}/image-to-video`;
      const blob = new Blob([Buffer.from(c.imagem.base64, "base64")], { type: c.imagem.mimeType });
      input.image_url = await fal.storage.upload(blob);
    } else {
      endpoint = `${c.prefixo}/text-to-video`;
      if (c.proporcao) input.aspect_ratio = c.proporcao;
    }

    const fila = await fal.queue.submit(endpoint, { input });
    return Response.json({ endpoint, requestId: fila.request_id });
  } catch (erro) {
    return Response.json({ error: `Erro do fal.ai: ${mensagemDeErro(erro)}` }, { status: 500 });
  }
}

function mensagemDeErro(erro: unknown): string {
  if (erro && typeof erro === "object" && "body" in erro) {
    try {
      return JSON.stringify((erro as { body: unknown }).body);
    } catch {
      /* segue */
    }
  }
  return erro instanceof Error ? erro.message : String(erro);
}
