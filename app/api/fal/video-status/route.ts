import { clienteFal, mensagemErroFal, statusErroFal } from "@/lib/fal";
import { MODO_NUVEM, comSaldo, contexto, estornar, responderErro, sql, type Contexto } from "@/lib/servidor/contexto";

export const runtime = "nodejs";

// Consulta o andamento de um vídeo no fal.ai e devolve o link quando estiver pronto.
// Se o vídeo falhar, os créditos cobrados no envio são devolvidos.
export async function GET(req: Request) {
  let ctx: Contexto | null = null;
  try {
    if (MODO_NUVEM) ctx = await contexto(req);
    const fal = clienteFal(req);
    if (!fal) return Response.json({ error: "Chave do fal.ai não configurada." }, { status: 400 });

    const params = new URL(req.url).searchParams;
    let endpoint = params.get("endpoint");
    const requestId = params.get("requestId");
    if (!endpoint || !requestId) return Response.json({ error: "Parâmetros ausentes." }, { status: 400 });
    if (ctx) {
      // No modo nuvem, só consulta vídeos cobrados desta conta, pelo modelo guardado na cobrança.
      const [m] = await sql()`select meta from movimentos where conta_id = ${ctx.conta.id}::uuid and tipo = 'uso' and ref = ${requestId} limit 1`;
      const salvo = (m?.meta as { endpoint?: string } | null)?.endpoint;
      if (salvo) endpoint = salvo;
      else if (!m) return Response.json({ error: "Vídeo não encontrado nesta conta." }, { status: 404 });
    }

    const falhou = async (mensagem: string) => {
      if (ctx) await estornar(ctx, requestId, "Vídeo não ficou pronto: créditos devolvidos");
      return comSaldo(Response.json({ pronto: true, erro: mensagem, estornado: !!ctx }), ctx);
    };

    let status;
    try {
      status = await fal.queue.status(endpoint, { requestId, logs: true });
    } catch {
      // Falha passageira ao consultar: tenta de novo na próxima vez, sem dar o vídeo como perdido.
      return Response.json({ pronto: false });
    }
    try {
      if (status.status === "IN_QUEUE") {
        return Response.json({ pronto: false, fase: "fila", posicao: status.queue_position });
      }
      if (status.status === "IN_PROGRESS") {
        const ultimo = status.logs?.at(-1)?.message;
        return Response.json({ pronto: false, fase: "produzindo", detalhe: ultimo?.slice(0, 160) });
      }
      const resultado = await fal.queue.result(endpoint, { requestId });
      const dados = resultado.data as { video?: { url?: string } };
      if (!dados?.video?.url) return falhou("O fal.ai não devolveu vídeo.");
      return Response.json({ pronto: true, url: dados.video.url });
    } catch (erro) {
      // Só devolve créditos quando o fal.ai diz que o vídeo falhou. Resultado expirado/inexistente ou
      // instabilidade do fal.ai não geram devolução (evita devolver um vídeo que já foi entregue).
      const st = statusErroFal(erro);
      if (st === 404 || st === 410) return Response.json({ pronto: true, erro: "O vídeo não está mais disponível no fal.ai." });
      if (!st || st >= 500) return Response.json({ pronto: false });
      return falhou(`Erro do fal.ai: ${mensagemErroFal(erro)}`);
    }
  } catch (erro) {
    return responderErro(erro);
  }
}
