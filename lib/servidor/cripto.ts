import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

function chave(): Buffer {
  const segredo = process.env.CHAVE_CRIPTO?.trim();
  if (!segredo || segredo.length < 16) throw new Error("CHAVE_CRIPTO não configurada (mínimo 16 caracteres).");
  return createHash("sha256").update(segredo).digest();
}

/** Criptografa um texto (AES-256-GCM). Usado para guardar os tokens do Instagram. */
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), dados].map((b) => b.toString("base64url")).join(".");
}

export function decifrar(cifrado: string): string {
  const [iv, tag, dados] = cifrado.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", chave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(dados), d.final()]).toString("utf8");
}

/** Assina um pequeno objeto (para o "state" do login do Instagram não poder ser forjado). */
export function assinar(obj: Record<string, unknown>): string {
  const corpo = Buffer.from(JSON.stringify(obj)).toString("base64url");
  const sig = createHmac("sha256", chave()).update(corpo).digest("base64url");
  return `${corpo}.${sig}`;
}

export function verificarAssinatura<T>(token: string): T | null {
  const [corpo, sig] = token.split(".");
  if (!corpo || !sig) return null;
  const esperado = createHmac("sha256", chave()).update(corpo).digest();
  const recebido = Buffer.from(sig, "base64url");
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;
  return JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as T;
}
