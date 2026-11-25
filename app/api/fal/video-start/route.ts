import { clienteFal, enviarImagemFal, mensagemErroFal, statusErroFal } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 60;

type Corpo = {
  familia: "seedance" | "veo";
  modelo: string; // ex.: "bytedance/seedance-2.5" ou "fal-ai/veo3.1/fast"
  prompt: string;
  imagem?: { mimeType: string; base64: string };
  resolucao?: string;
  duracao?: string;
  proporcao?: string;
};

// Envia um pedido de vídeo (Seedance ou Veo) para a fila do fal.ai e devolve o id do pedido.
export async function POST(req: Request) {
  const fal = clienteFal(req);
  if (!fal) return Response.json({ error: "Chave do fal.ai não configurada." }, { status: 400 });

  const c = (await req.json()) as Corpo;
  try {
    const input: Record<string, unknown> = { prompt: c.prompt };
    if (c.resolucao) input.resolution = c.resolucao;
    if (c.duracao) input.duration = c.duracao;

    let endpoint: string;
    if (c.imagem) {
      endpoint = `${c.modelo}/image-to-video`;
      input.image_url = await enviarImagemFal(fal, c.imagem);
      // No Seedance com imagem a proporção segue a da imagem.
      if (c.familia === "veo" && c.proporcao) input.aspect_ratio = c.proporcao;
    } else {
      endpoint = c.familia === "seedance" ? `${c.modelo}/text-to-video` : c.modelo;
      if (c.proporcao) input.aspect_ratio = c.proporcao;
    }

    try {
      const fila = await fal.queue.submit(endpoint, { input });
      return Response.json({ endpoint, requestId: fila.request_id });
    } catch (erro) {
      // Se o modelo recusar a proporção, tenta de novo deixando no automático.
      if (statusErroFal(erro) !== 422 || !("aspect_ratio" in input)) throw erro;
      delete input.aspect_ratio;
      const fila = await fal.queue.submit(endpoint, { input });
      return Response.json({ endpoint, requestId: fila.request_id });
    }
  } catch (erro) {
    return Response.json({ error: `Erro do fal.ai: ${mensagemErroFal(erro)}` }, { status: 500 });
  }
}
