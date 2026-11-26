import "server-only";
import { sql } from "./contexto";

let dolar: { valor: number; em: number } | null = null;

/** Cotação do dólar hoje (para avisar quando o câmbio usado nos créditos ficou desatualizado). */
export async function dolarHoje(): Promise<number | null> {
  if (dolar && Date.now() - dolar.em < 3600_000) return dolar.valor;
  try {
    const r = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", { signal: AbortSignal.timeout(3000) });
    const j = (await r.json()) as { USDBRL?: { bid?: string } };
    const v = Number(j.USDBRL?.bid);
    if (!v) return dolar?.valor ?? null;
    dolar = { valor: v, em: Date.now() };
    return v;
  } catch {
    return dolar?.valor ?? null;
  }
}

/** Gasto com IA no mês (em reais) e o limite de alerta configurado. */
export async function gastoDoMes() {
  const [r] = await sql()`select
      coalesce((select sum(custo_usd) from movimentos where tipo = 'uso'
        and criado_em >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'), 0) as usd,
      g.cambio, g.alerta_gasto_mensal
    from config_global g where g.id = 1`;
  const brl = Number(r.usd) * Number(r.cambio);
  return { brl, limite: Number(r.alerta_gasto_mensal ?? 0) };
}

/** Texto do alerta de gasto (ou null), mostrado ao administrador quando entra. */
export async function alertaDeGasto(): Promise<string | null> {
  const { brl, limite } = await gastoDoMes();
  if (!limite) return null;
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (brl >= limite) return `Atenção: o gasto com IA este mês (${fmt(brl)}) passou do seu limite de ${fmt(limite)}. Veja em Administração.`;
  if (brl >= limite * 0.8) return `O gasto com IA este mês já está em ${fmt(brl)} (${Math.round((brl / limite) * 100)}% do limite de ${fmt(limite)}).`;
  return null;
}
