import "server-only";
import { createHash, randomBytes } from "crypto";
import { sql } from "./contexto";

/** O link tem um código aleatório; no banco fica só o "hash" (quem vê o banco não consegue montar o link). */
export function novoToken() {
  return randomBytes(24).toString("base64url");
}
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type Link = { id: string; conta_id: string; perfil_id: string; nome: string | null; itens: string[]; expira_em: Date };

/** Link válido (existe, não foi revogado e não venceu), ou null. */
export async function linkValido(token: string): Promise<Link | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [l] = await sql()`select id, conta_id, perfil_id, nome, itens, expira_em from links_aprovacao
    where token_hash = ${hashToken(token)} and not revogado and expira_em > now()`;
  return (l as Link | undefined) ?? null;
}
