import { createFalClient } from "@fal-ai/client";

export function clienteFal(req: Request) {
  const chave = req.headers.get("x-fal-key");
  return chave ? createFalClient({ credentials: chave }) : null;
}

export async function enviarImagemFal(
  fal: ReturnType<typeof createFalClient>,
  imagem: { mimeType: string; base64: string },
): Promise<string> {
  const blob = new Blob([Buffer.from(imagem.base64, "base64")], { type: imagem.mimeType });
  return fal.storage.upload(blob);
}

/** Erros do fal.ai trazem detalhes em `body` (ex.: campo inválido). */
export function mensagemErroFal(erro: unknown): string {
  if (erro && typeof erro === "object" && "body" in erro) {
    try {
      return JSON.stringify((erro as { body: unknown }).body);
    } catch {
      /* segue */
    }
  }
  return erro instanceof Error ? erro.message : String(erro);
}

export function statusErroFal(erro: unknown): number | undefined {
  if (erro && typeof erro === "object" && "status" in erro) {
    const s = (erro as { status: unknown }).status;
    return typeof s === "number" ? s : undefined;
  }
  return undefined;
}
