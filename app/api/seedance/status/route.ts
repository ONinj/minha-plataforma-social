import { createFalClient } from "@fal-ai/client";

export const runtime = "nodejs";

// Consulta o andamento de um vídeo no Seedance e devolve o link quando estiver pronto.
export async function GET(req: Request) {
  const chave = req.headers.get("x-fal-key");
  if (!chave) return Response.json({ error: "Chave do fal.ai não configurada." }, { status: 400 });

  const params = new URL(req.url).searchParams;
  const endpoint = params.get("endpoint");
  const requestId = params.get("requestId");
  if (!endpoint || !requestId) return Response.json({ error: "Parâmetros ausentes." }, { status: 400 });

  const fal = createFalClient({ credentials: chave });
  try {
    const status = await fal.queue.status(endpoint, { requestId, logs: false });
    if (status.status !== "COMPLETED") return Response.json({ pronto: false });

    const resultado = await fal.queue.result(endpoint, { requestId });
    const dados = resultado.data as { video?: { url?: string } };
    if (!dados?.video?.url) return Response.json({ pronto: true, erro: "O Seedance não devolveu vídeo." });
    return Response.json({ pronto: true, url: dados.video.url });
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    return Response.json({ pronto: true, erro: `Erro do fal.ai: ${msg}` });
  }
}
