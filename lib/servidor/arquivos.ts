import "server-only";
import { createClient } from "@supabase/supabase-js";
import { urlSupabase } from "../supabaseUrl";
import { ErroHttp, sql, type Contexto } from "./contexto";

const BALDE = "midias";

function cliente() {
  const url = urlSupabase();
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
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

/** Confere a cota de armazenamento do plano antes de liberar um envio. */
export async function conferirCota(ctx: Contexto) {
  const gb = ctx.recursos.armazenamento_gb;
  if (!gb) return;
  let usado = 0;
  try {
    const [r] = await sql()`select coalesce(sum((metadata->>'size')::bigint), 0)::bigint as bytes
      from storage.objects where bucket_id = ${BALDE} and name like ${`${ctx.conta.id}/%`}`;
    usado = Number(r.bytes);
  } catch {
    return; // sem acesso ao catálogo de arquivos: não bloqueia
  }
  if (usado >= gb * 1024 ** 3) {
    throw new ErroHttp(
      403,
      `O espaço de arquivos do seu plano (${gb} GB) está cheio. Apague mídias antigas em Mídias e envios ou mude de plano.`,
      "plano",
    );
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

/** Tamanho do arquivo (bytes) no armazenamento, ou null se não der para saber. */
export async function tamanhoDoArquivo(caminho: string): Promise<number | null> {
  try {
    const r = await fetch(await linkDeLeitura(caminho, 300), { method: "HEAD" });
    const n = Number(r.headers.get("content-length"));
    return r.ok && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Lê a duração (segundos) de um MP4/MOV procurando a caixa "mvhd" no começo ou no fim do arquivo. */
export async function duracaoDoVideo(caminho: string): Promise<number | null> {
  try {
    const url = await linkDeLeitura(caminho, 300);
    const trecho = async (intervalo: string) => {
      const r = await fetch(url, { headers: { Range: `bytes=${intervalo}` } });
      return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    };
    const ler = (b: Buffer | null) => {
      if (!b) return null;
      const i = b.indexOf("mvhd");
      if (i < 0 || i + 32 > b.length) return null;
      const versao = b[i + 4];
      const escala = versao === 1 ? b.readUInt32BE(i + 24) : b.readUInt32BE(i + 16);
      const dur = versao === 1 ? Number(b.readBigUInt64BE(i + 28)) : b.readUInt32BE(i + 20);
      return escala > 0 ? dur / escala : null;
    };
    const inicio = ler(await trecho("0-1048575"));
    if (inicio) return inicio;
    const total = await tamanhoDoArquivo(caminho);
    if (!total || total <= 1048576) return null;
    return ler(await trecho(`${Math.max(0, total - 2097152)}-${total - 1}`));
  } catch {
    return null;
  }
}
