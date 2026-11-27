import "server-only";
import { linkDeLeitura } from "./arquivos";
import { sql } from "./contexto";

export const LIMITE_TEXTO = 4000;

/** Mensagens de uma conversa, com link temporário do anexo (print) quando houver. */
export async function mensagensDaConversa(conversa: string, incluirNotas: boolean) {
  const db = sql();
  const linhas = await db`select id, autor, autor_email, texto, anexo, criado_em from suporte_mensagens
    where conversa_id = ${conversa}::uuid ${incluirNotas ? db`` : db`and autor <> 'nota'`} order by id limit 500`;
  return Promise.all(
    linhas.map(async (m) => ({ ...m, anexo_url: m.anexo ? await linkDeLeitura(m.anexo, 3600).catch(() => null) : null })),
  );
}

export function textoValido(t: unknown) {
  const s = String(t ?? "").trim();
  return s.length > 0 && s.length <= LIMITE_TEXTO ? s : null;
}
