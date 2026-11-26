import "server-only";

/** Pacotes de recarga avulsa (créditos extras que não expiram com a renovação). */
export const PACOTES: Record<string, { creditos: number; valor: number; nome: string }> = {
  p100: { creditos: 100, valor: 14.9, nome: "100 créditos" },
  p500: { creditos: 500, valor: 69.9, nome: "500 créditos" },
  p1500: { creditos: 1500, valor: 199.9, nome: "1.500 créditos" },
};

/** Valor da recarga com o desconto do plano. */
export function valorRecarga(valor: number, desconto = 0) {
  return Math.round(valor * (1 - Math.min(Math.max(desconto, 0), 0.5)) * 100) / 100;
}

/** Asaas em produção? Aceita "producao", "produção", "Produção", "production" ou "prod". */
export function asaasEmProducao() {
  const v = (process.env.ASAAS_AMBIENTE ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return ["producao", "production", "prod"].includes(v);
}

function base() {
  if (process.env.ASAAS_BASE_URL) return process.env.ASAAS_BASE_URL;
  return asaasEmProducao() ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

/** Guarda o último aviso recebido do Asaas, para o diagnóstico (não guarda dados do cliente). */
export async function registrarAviso(dados: Record<string, unknown>) {
  const { sql } = await import("./contexto");
  await sql()`update config_global set ultimo_webhook = ${sql().json({ ...dados, em: new Date().toISOString() } as never)} where id = 1`.catch(() => {});
}

export async function asaas<T = Record<string, unknown>>(caminho: string, metodo = "GET", corpo?: unknown): Promise<T> {
  const chave = process.env.ASAAS_API_KEY;
  if (!chave) throw new Error("Cobrança não configurada (ASAAS_API_KEY).");
  const r = await fetch(`${base()}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", access_token: chave, "User-Agent": "central-social" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j as { errors?: { description?: string }[] }).errors?.map((e) => e.description).join(" ") || `Erro ${r.status}`;
    throw new Error(`Asaas: ${msg}`);
  }
  return j as T;
}

export function hoje() {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); // horário de Brasília
}
