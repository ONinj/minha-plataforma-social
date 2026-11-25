import { clienteFal, enviarImagemFal, mensagemErroFal } from "@/lib/fal";
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
export const maxDuration = 300;

type Corpo = {
  modelo: string; // ex.: "fal-ai/nano-banana-2"
  prompt: string;
  proporcao?: string;
  referencias?: { mimeType: string; base64: string }[];
};

// Gera (ou edita, quando há imagens de referência) uma imagem no fal.ai e devolve os arquivos.
export async function POST(req: Request) {
  let ctx: Contexto | null = null;
  try {
    const c = (await req.json()) as Corpo;
    let custo = 0;
    let usd = 0;
    if (MODO_NUVEM) {
      ctx = await contexto(req);
      exigirRecurso(ctx.recursos.imagem.includes(c.modelo), "Este modelo de imagem não está no seu plano.");
      usd = ctx.precos.imagem[c.modelo] ?? 0.15;
      custo = usdParaCreditos(ctx, usd);
      exigirSaldo(ctx, custo);
    }
    const fal = clienteFal(req);
    if (!fal) return Response.json({ error: "Chave do fal.ai não configurada." }, { status: 400 });

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
    if (ctx && imagens.length) {
      await debitar(ctx, custo * imagens.length, `Imagem · ${c.modelo.split("/").pop()}`, {
        custoUsd: usd * imagens.length,
        permitirNegativo: true,
      });
    }
    return comSaldo(Response.json({ imagens, texto: dados.description ?? "" }), ctx);
  } catch (erro) {
    if (erro && typeof erro === "object" && "body" in erro) {
      return Response.json({ error: `Erro do fal.ai: ${mensagemErroFal(erro)}` }, { status: 500 });
    }
    return responderErro(erro);
  }
}
