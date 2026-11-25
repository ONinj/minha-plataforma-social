import { GOOGLE_BASE, chaveGoogle, repassarErroGoogle } from "@/lib/google";

export const runtime = "nodejs";

type ModeloGoogle = {
  name: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
};

// Lista os modelos que a sua chave do Google consegue usar, para a tela de Configurações.
export async function GET(req: Request) {
  const chave = chaveGoogle(req);
  if (!chave) return Response.json({ error: "Chave do Google não configurada." }, { status: 400 });

  const modelos: ModeloGoogle[] = [];
  let pageToken = "";
  for (let i = 0; i < 10; i++) {
    const url = `${GOOGLE_BASE}/models?pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const resp = await fetch(url, { headers: { "x-goog-api-key": chave } });
    if (!resp.ok) return repassarErroGoogle(resp);
    const j = await resp.json();
    modelos.push(...(j.models ?? []));
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }

  return Response.json({
    modelos: modelos.map((m) => ({
      id: m.name.replace(/^models\//, ""),
      nome: m.displayName ?? m.name,
      metodos: m.supportedGenerationMethods ?? [],
    })),
  });
}
