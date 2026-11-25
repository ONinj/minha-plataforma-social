import { clienteFal, enviarImagemFal, mensagemErroFal } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 300;

type Corpo = {
  modelo: string; // ex.: "fal-ai/nano-banana-2"
  prompt: string;
  proporcao?: string;
  referencias?: { mimeType: string; base64: string }[];
};

// Gera (ou edita, quando há imagens de referência) uma imagem no fal.ai e devolve os arquivos.
export async function POST(req: Request) {
  const fal = clienteFal(req);
  if (!fal) return Response.json({ error: "Chave do fal.ai não configurada." }, { status: 400 });

  const c = (await req.json()) as Corpo;
  try {
    const input: Record<string, unknown> = { prompt: c.prompt, num_images: 1, output_format: "png" };
    if (c.proporcao) input.aspect_ratio = c.proporcao;

    let endpoint = c.modelo;
    if (c.referencias?.length) {
      endpoint = `${c.modelo}/edit`;
      input.image_urls = await Promise.all(c.referencias.map((r) => enviarImagemFal(fal, r)));
    }

    const resultado = await fal.subscribe(endpoint, { input });
    const dados = resultado.data as { images?: { url: string; content_type?: string }[]; description?: string };

    const imagens = [];
    for (const img of dados.images ?? []) {
      const resp = await fetch(img.url);
      if (!resp.ok) continue;
      imagens.push({
        mimeType: resp.headers.get("content-type") ?? img.content_type ?? "image/png",
        base64: Buffer.from(await resp.arrayBuffer()).toString("base64"),
      });
    }
    return Response.json({ imagens, texto: dados.description ?? "" });
  } catch (erro) {
    return Response.json({ error: `Erro do fal.ai: ${mensagemErroFal(erro)}` }, { status: 500 });
  }
}
