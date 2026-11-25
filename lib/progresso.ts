"use client";

import { useEffect, useState } from "react";
import type { Midia } from "./tipos";

/** Tempo típico (em segundos) quando ainda não há histórico. */
const PADRAO: Record<string, number> = { veo: 90, seedance: 180, gemini: 20 };

/** Atualiza o componente a cada `ms` (para relógios e barras ao vivo). */
export function useAgora(ms = 1000, ativo = true): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => setAgora(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, ativo]);
  return agora;
}

/** Duração média (s) dos últimos vídeos prontos do mesmo tipo, para estimar o tempo. */
export function duracaoEstimada(origem: string, historico: Midia[]): number {
  const duracoes = historico
    .filter((m) => m.origem === origem && m.status === "pronto" && m.iniciadoEm && m.prontoEm)
    .slice(0, 8)
    .map((m) => (Date.parse(m.prontoEm!) - Date.parse(m.iniciadoEm!)) / 1000)
    .filter((s) => s > 5 && s < 3600);
  if (!duracoes.length) return PADRAO[origem] ?? 120;
  return duracoes.reduce((a, b) => a + b, 0) / duracoes.length;
}

export type Andamento = {
  porcento: number;
  decorrido: number;
  restante: number | null;
  rotulo: string;
  atrasado: boolean;
};

/**
 * Os serviços de vídeo não informam a porcentagem real; ela é estimada pelo tempo
 * decorrido em relação à duração média dos vídeos anteriores (e nunca passa de 95%
 * antes de ficar pronto).
 */
export function calcularAndamento(m: Midia, historico: Midia[], agora: number): Andamento {
  const inicio = Date.parse(m.iniciadoEm ?? m.criadoEm);
  const decorrido = Math.max(0, (agora - inicio) / 1000);
  const total = duracaoEstimada(m.origem, historico);
  if (m.fase === "baixando") return { porcento: 98, decorrido, restante: 0, rotulo: "Baixando o vídeo", atrasado: false };
  if (m.fase === "fila") {
    return {
      porcento: Math.min(8, 2 + decorrido / 10),
      decorrido,
      restante: null,
      rotulo: m.posicaoFila ? `Na fila (posição ${m.posicaoFila + 1})` : "Na fila do servidor",
      atrasado: false,
    };
  }
  const porcento = Math.min(95, 8 + (decorrido / total) * 87);
  const restante = Math.max(0, total - decorrido);
  return {
    porcento,
    decorrido,
    restante: restante > 0 ? restante : null,
    rotulo: "Produzindo",
    atrasado: decorrido > total * 1.3,
  };
}

export function formatarTempo(segundos: number): string {
  const s = Math.round(segundos);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}min ${String(s % 60).padStart(2, "0")}s`;
}
