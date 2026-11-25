import { GOOGLE_BASE, chaveGoogle, repassarErroGoogle } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 300;

// Repassa uma chamada generateContent (texto ou imagem) para a API do Gemini.
export async function POST(req: Request) {
  const chave = chaveGoogle(req);
  if (!chave) return Response.json({ error: "Chave do Google não configurada." }, { status: 400 });

  const { model, contents, generationConfig, systemInstruction } = await req.json();
  const resp = await fetch(`${GOOGLE_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
    body: JSON.stringify({ contents, generationConfig, systemInstruction }),
  });
  if (!resp.ok) return repassarErroGoogle(resp);
  return Response.json(await resp.json());
}
