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
    const status = await fal.queue.status(endpoint, { requestId, logs: true });
    if (status.status === "IN_QUEUE") {
      return Response.json({ pronto: false, fase: "fila", posicao: status.queue_position });
    }
    if (status.status === "IN_PROGRESS") {
      const ultimo = status.logs?.at(-1)?.message;
      return Response.json({ pronto: false, fase: "produzindo", detalhe: ultimo?.slice(0, 160) });
    }

    const resultado = await fal.queue.result(endpoint, { requestId });
    const dados = resultado.data as { video?: { url?: string } };
    if (!dados?.video?.url) return Response.json({ pronto: true, erro: "O fal.ai não devolveu vídeo." });
    return Response.json({ pronto: true, url: dados.video.url });
  } catch (erro) {
    return Response.json({ pronto: true, erro: `Erro do fal.ai: ${mensagemErroFal(erro)}` });
  }
}
