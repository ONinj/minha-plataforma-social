"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { db } from "./db";
import { CONFIG_PADRAO, ESTADO_INICIAL, type Estado, type Midia } from "./tipos";
import { mesAtual } from "./util";

type Contexto = {
  estado: Estado;
  carregado: boolean;
  atualizar: (fn: (e: Estado) => Estado) => void;
  obter: () => Estado;
  salvarBlob: (id: string, blob: Blob) => Promise<void>;
  lerBlob: (id: string) => Promise<Blob | undefined>;
  registrarGasto: (categoria: "claude" | "gemini" | "veo" | "seedance", usd: number) => void;
  atualizarMidia: (id: string, dados: Partial<Midia>) => void;
};

const Ctx = createContext<Contexto | null>(null);
const CHAVE_ESTADO = "estado";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<Estado>(ESTADO_INICIAL);
  const [carregado, setCarregado] = useState(false);
  const ref = useRef<Estado>(ESTADO_INICIAL);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    db.ler<Estado>(CHAVE_ESTADO)
      .then((salvo) => {
        if (salvo) {
          const completo: Estado = { ...ESTADO_INICIAL, ...salvo, config: { ...CONFIG_PADRAO, ...salvo.config } };
          // Preço antigo padrão do Gemini direto → preço do Nano Banana 2 no fal.ai.
          if (!("provedorImagem" in (salvo.config ?? {})) && completo.config.precoImagem === 0.067) {
            completo.config.precoImagem = CONFIG_PADRAO.precoImagem;
          }
          if (!("provedorVeo" in (salvo.config ?? {})) && completo.config.precoVeoSegundo === 0.12) {
            completo.config.precoVeoSegundo = CONFIG_PADRAO.precoVeoSegundo;
          }
          ref.current = completo;
          setEstado(completo);
        }
      })
      .finally(() => setCarregado(true));
  }, []);

  const atualizar = useCallback((fn: (e: Estado) => Estado) => {
    const novo = fn(ref.current);
    ref.current = novo;
    setEstado(novo);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(salvarAgora, 150);
  }, []);

  // Salva na hora se a aba for fechada ou ficar em segundo plano.
  useEffect(() => {
    const aoSair = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        salvarAgora();
      }
    };
    document.addEventListener("visibilitychange", aoSair);
    window.addEventListener("pagehide", aoSair);
    return () => {
      document.removeEventListener("visibilitychange", aoSair);
      window.removeEventListener("pagehide", aoSair);
    };
  }, []);

  function salvarAgora() {
    timer.current = null;
    db.gravar(CHAVE_ESTADO, ref.current).catch((e) => console.error("Falha ao salvar", e));
  }

  const obter = useCallback(() => ref.current, []);

  const salvarBlob = useCallback((id: string, blob: Blob) => db.gravar(`blob:${id}`, blob), []);
  const lerBlob = useCallback((id: string) => db.ler<Blob>(`blob:${id}`), []);

  const registrarGasto = useCallback(
    (categoria: "claude" | "gemini" | "veo" | "seedance", usd: number) => {
      if (!usd) return;
      const mes = mesAtual();
      atualizar((e) => {
        const atual = e.gastos[mes] ?? { claude: 0, gemini: 0, veo: 0, seedance: 0 };
        return { ...e, gastos: { ...e.gastos, [mes]: { ...atual, [categoria]: atual[categoria] + usd } } };
      });
    },
    [atualizar],
  );

  const atualizarMidia = useCallback(
    (id: string, dados: Partial<Midia>) =>
      atualizar((e) => ({ ...e, midias: e.midias.map((m) => (m.id === id ? { ...m, ...dados } : m)) })),
    [atualizar],
  );

  return (
    <Ctx.Provider
      value={{ estado, carregado, atualizar, obter, salvarBlob, lerBlob, registrarGasto, atualizarMidia }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useStore(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore fora do StoreProvider");
  return c;
}

const cacheUrls = new Map<string, string>();

/** Devolve um endereço local (blob:) para exibir uma mídia salva. */
export function useUrlMidia(id: string | undefined, versao?: string): string | undefined {
  const { lerBlob } = useStore();
  const [url, setUrl] = useState<string | undefined>(id ? cacheUrls.get(id) : undefined);

  useEffect(() => {
    if (!id) return;
    const emCache = cacheUrls.get(id);
    if (emCache) {
      setUrl(emCache);
      return;
    }
    let ativo = true;
    lerBlob(id).then((blob) => {
      if (!ativo || !blob) return;
      const u = URL.createObjectURL(blob);
      cacheUrls.set(id, u);
      setUrl(u);
    });
    return () => {
      ativo = false;
    };
  }, [id, versao, lerBlob]);

  return url;
}
