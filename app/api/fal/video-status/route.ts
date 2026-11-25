import { clienteFal, mensagemErroFal } from "@/lib/fal";

export const runtime = "nodejs";

// Consulta o andamento de um vídeo no fal.ai e devolve o link quando estiver pronto.
export async function GET(req: Request) {
  const fal = clienteFal(req);
  if (!fal) return Response.json({ error: "Chave do fal.ai não configurada." }, { status: 400 });

  const params = new URL(req.url).searchParams;
  const endpoint = params.get("endpoint");
  const requestId = params.get("requestId");
  if (!endpoint || !requestId) return Response.json({ error: "Parâmetros ausentes." }, { status: 400 });

  try {
    const status = await fal.queue.status(endpoint, { requestId, logs: false });
    if (status.status !== "COMPLETED") return Response.json({ pronto: false });

    const resultado = await fal.queue.result(endpoint, { requestId });
    const dados = resultado.data as { video?: { url?: string } };
    if (!dados?.video?.url) return Response.json({ pronto: true, erro: "O fal.ai não devolveu vídeo." });
    return Response.json({ pronto: true, url: dados.video.url });
  } catch (erro) {
    return Response.json({ pronto: true, erro: `Erro do fal.ai: ${mensagemErroFal(erro)}` });
  }
}
