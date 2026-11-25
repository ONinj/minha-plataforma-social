import type { MensagemClaude } from "./tipos";

/** Nome, @ e descrição do perfil ativo, no formato que o Claude recebe. */
export function textoDoPerfil(store: { marca: { nome: string; arroba: string; perfil: string } }): string {
  const { nome, arroba, perfil } = store.marca;
  return `Perfil: ${nome}${arroba ? ` (@${arroba})` : ""}\n${perfil.trim() || "(descrição ainda não preenchida)"}`;
}

const PREFIXO = "Perfil da marca / redes do usuário (atualizado):\n";

/**
 * O Claude exige que o texto de sistema e o histórico não mudem durante a conversa.
 * Por isso, quando o perfil da marca muda, ele entra como uma nova mensagem de sistema
 * no fim da conversa (em vez de editar o texto de sistema). Devolve a mensagem a
 * acrescentar, ou null se o perfil enviado por último ainda é o atual.
 */
export function mensagemDePerfil(chat: MensagemClaude[], perfil: string): MensagemClaude | null {
  const atual = perfil.trim();
  const ultimo = [...chat].reverse().find((m) => m.role === "system");
  const enviado =
    ultimo && typeof ultimo.content === "string" && ultimo.content.startsWith(PREFIXO)
      ? ultimo.content.slice(PREFIXO.length)
      : "";
  if (atual === enviado) return null;
  return { role: "system", content: PREFIXO + (atual || "(perfil apagado pelo usuário)") };
}

export function eMensagemDePerfil(m: MensagemClaude): boolean {
  return m.role === "system" && typeof m.content === "string" && m.content.startsWith(PREFIXO);
}
