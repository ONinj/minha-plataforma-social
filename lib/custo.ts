"use client";

import { MODO_NUVEM } from "./nuvem";
import { brl } from "./util";

/** Mostra um custo em dólar como créditos (modo nuvem) ou reais (modo local). */
export function textoCusto(usd: number, cambio: number): string {
  if (MODO_NUVEM) {
    const creditos = (usd * cambio) / 0.1;
    return `${creditos < 10 ? creditos.toFixed(1).replace(".", ",") : Math.round(creditos)} créditos`;
  }
  return brl(usd * cambio);
}

export function formatarCreditos(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: Math.abs(n) < 100 ? 1 : 0 });
}
