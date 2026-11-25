"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { db } from "./db";
import {
  CONFIG_PADRAO,
  CORES,
  type CategoriaGasto,
  type Configuracoes,
  type Conta,
  type Estado,
  type Marca,
  type Midia,
  type Raiz,
} from "./tipos";
import { agoraISO, mesAtual, novoId } from "./util";

export type Aviso = { id: string; texto: string; tipo: "ok" | "info" | "erro" };

type Contexto = {
  /** Visão do perfil ativo (usada pela maioria das telas). */
  estado: Estado;
  raiz: Raiz;
  conta: Conta;
  marca: Marca;
  carregado: boolean;
  atualizar: (fn: (e: Estado) => Estado) => void;
  obter: () => Estado;
  salvarBlob: (id: string, blob: Blob) => Promise<void>;
  lerBlob: (id: string) => Promise<Blob | undefined>;
  registrarGasto: (categoria: CategoriaGasto, usd: number) => void;
  /** Atualiza uma mídia em qualquer perfil da conta ativa (vídeos ficam prontos em segundo plano). */
  atualizarMidia: (id: string, dados: Partial<Midia>) => void;
  /** Mídias em produção em todos os perfis da conta ativa. */
  midiasGerando: () => Midia[];
  // Contas e perfis
  trocarConta: (id: string) => void;
  trocarMarca: (id: string) => void;
  criarConta: (dados: { nome: string; email: string; copiarChaves: boolean }) => void;
  editarConta: (id: string, dados: Partial<Pick<Conta, "nome" | "email" | "cor">>) => void;
  removerConta: (id: string) => void;
  criarMarca: (dados: { nome: string; arroba: string }) => void;
  editarMarca: (id: string, dados: Partial<Pick<Marca, "nome" | "arroba" | "cor" | "perfil" | "redes">>) => void;
  removerMarca: (id: string) => void;
  // Trava a troca de perfil enquanto o gerente trabalha
  ocupado: boolean;
  definirOcupado: (v: boolean) => void;
  // Avisos rápidos (toasts)
  avisos: Aviso[];
  avisar: (texto: string, tipo?: Aviso["tipo"]) => void;
  fecharAviso: (id: string) => void;
};

const Ctx = createContext<Contexto | null>(null);
const CHAVE_RAIZ = "raiz-v2";
const CHAVE_ANTIGA = "estado";

export function novaMarca(nome: string, arroba = "", cor?: string): Marca {
  return {
    id: novoId("mar"),
    nome,
    arroba: arroba.replace(/^@/, ""),
    cor: cor ?? CORES[Math.floor(Math.random() * CORES.length)],
    perfil: "",
    redes: {},
    criadoEm: agoraISO(),
    midias: [],
    aprovacoes: [],
    agendamentos: [],
    chatGerente: [],
    chatClaude: [],
    chatGemini: [],
    ideias: [],
    textos: [],
    gastos: {},
  };
}

function novaConta(nome: string, email: string, config: Configuracoes = CONFIG_PADRAO): Conta {
  const marca = novaMarca("Meu primeiro perfil", "", CORES[0]);
  return {
    id: novoId("cta"),
    nome,
    email,
    cor: CORES[1],
    config: { ...config },
    marcas: [marca],
    marcaAtiva: marca.id,
  };
}

function raizInicial(): Raiz {
  const conta = novaConta("Minha conta", "");
  return { versao: 2, contas: [conta], contaAtiva: conta.id };
}

/** Converte os dados da versão antiga (um perfil só) para contas + perfis. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrar(antigo: any): Raiz {
  const cfg = antigo.config ?? {};
  const config: Configuracoes = { ...CONFIG_PADRAO };
  for (const k of Object.keys(CONFIG_PADRAO) as (keyof Configuracoes)[]) {
    if (k in cfg) (config as Record<string, unknown>)[k] = cfg[k];
  }
  if (config.precoImagem === 0.067) config.precoImagem = CONFIG_PADRAO.precoImagem;
  if (config.precoVeoSegundo === 0.12) config.precoVeoSegundo = CONFIG_PADRAO.precoVeoSegundo;
  const marca: Marca = {
    ...novaMarca("Meu perfil", "", CORES[0]),
    perfil: cfg.perfilMarca ?? "",
    midias: antigo.midias ?? [],
    aprovacoes: antigo.aprovacoes ?? [],
    agendamentos: antigo.agendamentos ?? [],
    chatGerente: antigo.chatGerente ?? [],
    chatClaude: antigo.chatClaude ?? [],
    chatGemini: antigo.chatGemini ?? [],
    gastos: antigo.gastos ?? {},
  };
  const conta: Conta = { ...novaConta("Minha conta", "", config), marcas: [marca], marcaAtiva: marca.id };
  return { versao: 2, contas: [conta], contaAtiva: conta.id };
}

function completar(raiz: Raiz): Raiz {
  return {
    ...raiz,
    contas: raiz.contas.map((c) => ({
      ...c,
      config: { ...CONFIG_PADRAO, ...c.config },
      marcas: c.marcas.map((m) => ({ ...novaMarca(m.nome), ...m })),
    })),
  };
}

function ativos(raiz: Raiz) {
  const conta = raiz.contas.find((c) => c.id === raiz.contaAtiva) ?? raiz.contas[0];
  const marca = conta.marcas.find((m) => m.id === conta.marcaAtiva) ?? conta.marcas[0];
  return { conta, marca };
}

function visao(raiz: Raiz): Estado {
  const { conta, marca } = ativos(raiz);
  return {
    config: { ...conta.config, perfilMarca: marca.perfil },
    midias: marca.midias,
    aprovacoes: marca.aprovacoes,
    agendamentos: marca.agendamentos,
    chatGerente: marca.chatGerente,
    chatClaude: marca.chatClaude,
    chatGemini: marca.chatGemini,
    ideias: marca.ideias,
    textos: marca.textos,
    gastos: marca.gastos,
  };
}

function aplicarVisao(raiz: Raiz, v: Estado): Raiz {
  const { conta, marca } = ativos(raiz);
  const { perfilMarca, ...config } = v.config;
  const novaMarcaObj: Marca = {
    ...marca,
    perfil: perfilMarca,
    midias: v.midias,
    aprovacoes: v.aprovacoes,
    agendamentos: v.agendamentos,
    chatGerente: v.chatGerente,
    chatClaude: v.chatClaude,
    chatGemini: v.chatGemini,
    ideias: v.ideias,
    textos: v.textos,
    gastos: v.gastos,
  };
  return mudarConta(raiz, conta.id, (c) => ({
    ...c,
    config,
    marcas: c.marcas.map((m) => (m.id === marca.id ? novaMarcaObj : m)),
  }));
}

function mudarConta(raiz: Raiz, id: string, fn: (c: Conta) => Conta): Raiz {
  return { ...raiz, contas: raiz.contas.map((c) => (c.id === id ? fn(c) : c)) };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [raiz, setRaiz] = useState<Raiz>(raizInicial);
  const [carregado, setCarregado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const ref = useRef<Raiz>(raiz);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const salvarAgora = useCallback(() => {
    timer.current = null;
    db.gravar(CHAVE_RAIZ, ref.current).catch((e) => console.error("Falha ao salvar", e));
  }, []);

  const definirRaiz = useCallback(
    (nova: Raiz) => {
      ref.current = nova;
      setRaiz(nova);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(salvarAgora, 150);
    },
    [salvarAgora],
  );

  useEffect(() => {
    (async () => {
      try {
        const salvo = await db.ler<Raiz>(CHAVE_RAIZ);
        if (salvo?.versao === 2 && salvo.contas?.length) {
          const r = completar(salvo);
          ref.current = r;
          setRaiz(r);
        } else {
          const antigo = await db.ler<unknown>(CHAVE_ANTIGA);
          if (antigo) definirRaiz(migrar(antigo));
          else definirRaiz(raizInicial());
        }
      } finally {
        setCarregado(true);
      }
    })();
  }, [definirRaiz]);

  // Salva na hora se a aba for fechada ou ficar em segundo plano.
  useEffect(() => {
    const aoSair = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        salvarAgora();
      }
    };
    document.addEventListener("visibilitychange", aoSair);
    window.addEventListener("pagehide", aoSair);
    return () => {
      document.removeEventListener("visibilitychange", aoSair);
      window.removeEventListener("pagehide", aoSair);
    };
  }, [salvarAgora]);

  const atualizar = useCallback(
    (fn: (e: Estado) => Estado) => definirRaiz(aplicarVisao(ref.current, fn(visao(ref.current)))),
    [definirRaiz],
  );
  const obter = useCallback(() => visao(ref.current), []);
  const salvarBlob = useCallback((id: string, blob: Blob) => db.gravar(`blob:${id}`, blob), []);
  const lerBlob = useCallback((id: string) => db.ler<Blob>(`blob:${id}`), []);

  const avisar = useCallback((texto: string, tipo: Aviso["tipo"] = "info") => {
    const id = novoId("av");
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 6000);
  }, []);
  const fecharAviso = useCallback((id: string) => setAvisos((a) => a.filter((x) => x.id !== id)), []);

  const registrarGasto = useCallback(
    (categoria: CategoriaGasto, usd: number) => {
      if (!usd) return;
      const mes = mesAtual();
      const antes = totalContaMes(ativos(ref.current).conta, mes) * ativos(ref.current).conta.config.cambio;
      atualizar((e) => {
        const atual = e.gastos[mes] ?? { claude: 0, gemini: 0, veo: 0, seedance: 0 };
        return { ...e, gastos: { ...e.gastos, [mes]: { ...atual, [categoria]: atual[categoria] + usd } } };
      });
      const { conta } = ativos(ref.current);
      const depois = totalContaMes(conta, mes) * conta.config.cambio;
      const teto = conta.config.orcamentoMensal;
      if (teto > 0) {
        if (antes < teto && depois >= teto) avisar("Você atingiu o orçamento do mês desta conta.", "erro");
        else if (antes < teto * 0.8 && depois >= teto * 0.8) avisar("Você já usou 80% do orçamento do mês.", "info");
      }
    },
    [atualizar, avisar],
  );

  const atualizarMidia = useCallback(
    (id: string, dados: Partial<Midia>) => {
      const { conta } = ativos(ref.current);
      definirRaiz(
        mudarConta(ref.current, conta.id, (c) => ({
          ...c,
          marcas: c.marcas.map((m) =>
            m.midias.some((x) => x.id === id)
              ? { ...m, midias: m.midias.map((x) => (x.id === id ? { ...x, ...dados } : x)) }
              : m,
          ),
        })),
      );
    },
    [definirRaiz],
  );

  const midiasGerando = useCallback(
    () => ativos(ref.current).conta.marcas.flatMap((m) => m.midias.filter((x) => x.status === "gerando")),
    [],
  );

  const trocarConta = useCallback(
    (id: string) => definirRaiz({ ...ref.current, contaAtiva: id }),
    [definirRaiz],
  );
  const trocarMarca = useCallback(
    (id: string) => {
      const { conta } = ativos(ref.current);
      definirRaiz(mudarConta(ref.current, conta.id, (c) => ({ ...c, marcaAtiva: id })));
    },
    [definirRaiz],
  );
  const criarConta = useCallback(
    (d: { nome: string; email: string; copiarChaves: boolean }) => {
      const atual = ativos(ref.current).conta.config;
      const config = d.copiarChaves ? { ...atual } : { ...atual, chaveAnthropic: "", chaveFal: "" };
      const conta = { ...novaConta(d.nome, d.email, config), cor: CORES[ref.current.contas.length % CORES.length] };
      definirRaiz({ ...ref.current, contas: [...ref.current.contas, conta], contaAtiva: conta.id });
    },
    [definirRaiz],
  );
  const editarConta = useCallback(
    (id: string, dados: Partial<Pick<Conta, "nome" | "email" | "cor">>) =>
      definirRaiz(mudarConta(ref.current, id, (c) => ({ ...c, ...dados }))),
    [definirRaiz],
  );
  const removerConta = useCallback(
    (id: string) => {
      const contas = ref.current.contas.filter((c) => c.id !== id);
      if (!contas.length) return;
      definirRaiz({ ...ref.current, contas, contaAtiva: ref.current.contaAtiva === id ? contas[0].id : ref.current.contaAtiva });
    },
    [definirRaiz],
  );
  const criarMarca = useCallback(
    (d: { nome: string; arroba: string }) => {
      const { conta } = ativos(ref.current);
      const marca = novaMarca(d.nome, d.arroba, CORES[conta.marcas.length % CORES.length]);
      definirRaiz(mudarConta(ref.current, conta.id, (c) => ({ ...c, marcas: [...c.marcas, marca], marcaAtiva: marca.id })));
    },
    [definirRaiz],
  );
  const editarMarca = useCallback(
    (id: string, dados: Partial<Pick<Marca, "nome" | "arroba" | "cor" | "perfil" | "redes">>) => {
      const { conta } = ativos(ref.current);
      definirRaiz(
        mudarConta(ref.current, conta.id, (c) => ({
          ...c,
          marcas: c.marcas.map((m) =>
            m.id === id ? { ...m, ...dados, arroba: (dados.arroba ?? m.arroba).replace(/^@/, "") } : m,
          ),
        })),
      );
    },
    [definirRaiz],
  );
  const removerMarca = useCallback(
    (id: string) => {
      const { conta } = ativos(ref.current);
      const marcas = conta.marcas.filter((m) => m.id !== id);
      if (!marcas.length) return;
      definirRaiz(
        mudarConta(ref.current, conta.id, (c) => ({
          ...c,
          marcas,
          marcaAtiva: c.marcaAtiva === id ? marcas[0].id : c.marcaAtiva,
        })),
      );
    },
    [definirRaiz],
  );

  const { conta, marca } = ativos(raiz);

  return (
    <Ctx.Provider
      value={{
        estado: visao(raiz),
        raiz,
        conta,
        marca,
        carregado,
        atualizar,
        obter,
        salvarBlob,
        lerBlob,
        registrarGasto,
        atualizarMidia,
        midiasGerando,
        trocarConta,
        trocarMarca,
        criarConta,
        editarConta,
        removerConta,
        criarMarca,
        editarMarca,
        removerMarca,
        ocupado,
        definirOcupado: setOcupado,
        avisos,
        avisar,
        fecharAviso,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function totalMes(gastos: Marca["gastos"], mes = mesAtual()): number {
  const g = gastos[mes];
  return g ? g.claude + g.gemini + g.veo + g.seedance : 0;
}

export function totalContaMes(conta: Conta, mes = mesAtual()): number {
  return conta.marcas.reduce((s, m) => s + totalMes(m.gastos, mes), 0);
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
