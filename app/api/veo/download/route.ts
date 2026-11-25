import { chaveGoogle, repassarErroGoogle } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 120;

// Baixa o vídeo pronto do Veo (o download exige a chave, então passa por aqui).
export async function GET(req: Request) {
  const chave = chaveGoogle(req);
  if (!chave) return Response.json({ error: "Chave do Google não configurada." }, { status: 400 });

  const uri = new URL(req.url).searchParams.get("uri");
  if (!uri) return Response.json({ error: "URI ausente." }, { status: 400 });
  const destino = new URL(uri);
  if (destino.hostname !== "generativelanguage.googleapis.com") {
    return Response.json({ error: "Endereço de vídeo não permitido." }, { status: 400 });
  }

  const resp = await fetch(destino, { headers: { "x-goog-api-key": chave }, redirect: "follow" });
  if (!resp.ok || !resp.body) return repassarErroGoogle(resp);
  return new Response(resp.body, {
    headers: { "Content-Type": resp.headers.get("Content-Type") ?? "video/mp4" },
  });
}
