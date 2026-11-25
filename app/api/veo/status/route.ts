import { GOOGLE_BASE, chaveGoogle, repassarErroGoogle } from "@/lib/google";

export const runtime = "nodejs";

// Consulta se o vídeo do Veo já ficou pronto.
export async function GET(req: Request) {
  const chave = chaveGoogle(req);
  if (!chave) return Response.json({ error: "Chave do Google não configurada." }, { status: 400 });

  const operacao = new URL(req.url).searchParams.get("operacao");
  if (!operacao || !/^[\w./-]+$/.test(operacao)) {
    return Response.json({ error: "Operação inválida." }, { status: 400 });
  }

  const resp = await fetch(`${GOOGLE_BASE}/${operacao}`, { headers: { "x-goog-api-key": chave } });
  if (!resp.ok) return repassarErroGoogle(resp);
  const j = await resp.json();

  if (!j.done) return Response.json({ pronto: false });
  if (j.error) return Response.json({ pronto: true, erro: j.error.message ?? "Falha na geração." });

  const resposta = j.response?.generateVideoResponse;
  const uri: string | undefined = resposta?.generatedSamples?.[0]?.video?.uri;
  if (!uri) {
    const filtrado = resposta?.raiMediaFilteredReasons?.[0];
    return Response.json({
      pronto: true,
      erro: filtrado ? `O Google bloqueou o vídeo: ${filtrado}` : "O Veo não devolveu nenhum vídeo.",
    });
  }
  return Response.json({ pronto: true, uri });
}
