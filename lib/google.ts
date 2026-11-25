export const GOOGLE_BASE = "https://generativelanguage.googleapis.com/v1beta";

export function chaveGoogle(req: Request): string | null {
  return req.headers.get("x-gemini-key");
}

export async function repassarErroGoogle(resp: Response) {
  let mensagem = `Erro do Google (${resp.status})`;
  try {
    const j = await resp.json();
    if (j?.error?.message) mensagem += `: ${j.error.message}`;
  } catch {
    /* corpo sem JSON */
  }
  return Response.json({ error: mensagem }, { status: resp.status });
}
