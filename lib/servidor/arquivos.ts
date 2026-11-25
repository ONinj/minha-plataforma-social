import "server-only";
import { createClient } from "@supabase/supabase-js";
import { ErroHttp, type Contexto } from "./contexto";

const BALDE = "midias";

function cliente() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("Supabase não configurado no servidor.");
  return createClient(url, chave, { auth: { persistSession: false } });
}

/** Caminho do arquivo no armazenamento; só aceita arquivos da própria conta. */
export function caminhoDaConta(ctx: Contexto, nome: string): string {
  const limpo = nome.replace(/[^\w.\-]/g, "_");
  return `${ctx.conta.id}/${limpo}`;
}

export function conferirCaminho(ctx: Contexto, caminho: string) {
  if (!caminho.startsWith(`${ctx.conta.id}/`) || caminho.includes("..")) {
    throw new ErroHttp(403, "Arquivo de outra conta.");
  }
}

export async function linkDeEnvio(caminho: string) {
  const { data, error } = await cliente().storage.from(BALDE).createSignedUploadUrl(caminho, { upsert: true });
  if (error) throw new Error(`Armazenamento: ${error.message}`);
  return { url: data.signedUrl, token: data.token, caminho };
}

export async function linkDeLeitura(caminho: string, segundos = 3600) {
  const { data, error } = await cliente().storage.from(BALDE).createSignedUrl(caminho, segundos);
  if (error) throw new Error(`Armazenamento: ${error.message}`);
  return data.signedUrl;
}

export async function apagarArquivos(caminhos: string[]) {
  if (!caminhos.length) return;
  await cliente().storage.from(BALDE).remove(caminhos);
}
