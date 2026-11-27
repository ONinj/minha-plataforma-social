import { MODO_NUVEM, sql } from "@/lib/servidor/contexto";
import { plataformaConfigurada } from "@/lib/servidor/metricool";

export const runtime = "nodejs";
export const revalidate = 300;

/** Planos à venda (público, para a página de vendas): só preço, créditos e benefícios. */
export async function GET() {
  if (!MODO_NUVEM) return Response.json({ planos: [] });
  try {
    const db = sql();
    const planos = await db`select id, nome, preco, creditos_mensais, recursos from planos where publico order by ordem`;
    const [cfg] = await db`select cambio, precos from config_global where id = 1`;
    return Response.json(
      {
        planos: planos.map((p) => ({ ...p, preco: Number(p.preco), creditos_mensais: Number(p.creditos_mensais) })),
        cambio: Number(cfg.cambio),
        precos: cfg.precos,
        whatsapp: process.env.NEXT_PUBLIC_WHATSAPP ?? "",
        // Publicação automática só aparece como disponível quando estiver ligada de verdade.
        publicacaoAtiva: plataformaConfigurada() || !!(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET),
      },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch {
    return Response.json({ planos: [] });
  }
}
