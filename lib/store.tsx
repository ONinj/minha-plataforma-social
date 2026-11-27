"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { db } from "./db";
import { MODO_NUVEM, api, baixarArquivo, eventosNuvem, supabase } from "./nuvem";
import { Sincronizador, carregarDaNuvem, configDoPlano, enfileirarEnvio, type InfoNuvem } from "./sincronia";
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
  editarMarca: (id: string, dados: Partial<Pick<Marca, "nome" | "arroba" | "cor" | "perfil" | "redes" | "guia" | "guiaArquivo" | "respostasPerfil">>) => void;
  removerMarca: (id: string) => void;
  // Trava a troca de perfil enquanto o gerente trabalha
  ocupado: boolean;
  /** Marca o início (true) ou o fim (false) de um trabalho longo; vários podem correr juntos. */
  definirOcupado: (v: boolean) => void;
  /** Texto do trabalho em segundo plano (ex.: importação), mostrado no topo em qualquer aba. */
  tarefa?: string;
  definirTarefa: (t?: string) => void;
  // Avisos rápidos (toasts)
  avisos: Aviso[];
  avisar: (texto: string, tipo?: Aviso["tipo"]) => void;
  fecharAviso: (id: string) => void;
  // Modo nuvem (login, plano e créditos). Nulo no modo local.
  nuvem: InfoNuvem | null;
  sessao: "carregando" | "sem_login" | "pronta";
  recarregarNuvem: () => Promise<void>;
  importavel: boolean;
  importarLocal: () => Promise<void>;
  recusarImportacao: () => void;
  sair: () => Promise<void>;
  /** Erro ao carregar a conta da nuvem (mostrado na tela, com opção de tentar de novo). */
  erroCarga: string | null;
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
  const [trabalhos, setTrabalhos] = useState(0);
  const [tarefa, definirTarefa] = useState<string>();
  const definirOcupado = useCallback((v: boolean) => setTrabalhos((n) => Math.max(0, n + (v ? 1 : -1))), []);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [nuvem, setNuvem] = useState<InfoNuvem | null>(null);
  const [sessao, setSessao] = useState<"carregando" | "sem_login" | "pronta">(MODO_NUVEM ? "carregando" : "pronta");
  const [importavel, setImportavel] = useState<Raiz | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const ref = useRef<Raiz>(raiz);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaSincronia = useRef(0);

  const avisar = useCallback((texto: string, tipo: Aviso["tipo"] = "info") => {
    const id = novoId("av");
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 7000);
  }, []);
  const fecharAviso = useCallback((id: string) => setAvisos((a) => a.filter((x) => x.id !== id)), []);

  const sinc = useRef<Sincronizador | null>(null);
  if (MODO_NUVEM && !sinc.current) {
    sinc.current = new Sincronizador(
      (m) => avisar(`Não consegui salvar na nuvem: ${m}`, "erro"),
      (m) => avisar(m, "erro"),
    );
  }

  const salvarAgora = useCallback(() => {
    timer.current = null;
    if (MODO_NUVEM) {
      const r = ref.current;
      const conta = r.contas.find((c) => c.id === r.contaAtiva);
      if (conta) localStorage.setItem(`perfil-ativo:${conta.id}`, conta.marcaAtiva);
      void sinc.current?.salvar(r);
    } else {
      db.gravar(CHAVE_RAIZ, ref.current).catch((e) => console.error("Falha ao salvar", e));
    }
  }, []);

  const definirRaiz = useCallback(
    (nova: Raiz) => {
      ref.current = nova;
      setRaiz(nova);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(salvarAgora, MODO_NUVEM ? 1200 : 150);
    },
    [salvarAgora],
  );

  /** Carrega (ou recarrega) a conta da nuvem. */
  const carregarNuvem = useCallback(
    async (contaPedida?: string) => {
      const { raiz: r, info, ultimo } = await carregarDaNuvem(contaPedida);
      ref.current = r;
      setRaiz(r);
      setNuvem(info);
      try {
        localStorage.setItem("conta-ativa", info.conta.id);
      } catch {}
      sinc.current?.marcarSalvo(r);
      ultimaSincronia.current = ultimo;
      setSessao("pronta");
      // Dados antigos deste navegador que ainda não estão na nuvem?
      if (!ultimo) {
        const local = await db.ler<Raiz>(CHAVE_RAIZ);
        const temConteudo = local?.contas?.some((c) =>
          c.marcas.some((m) => m.chatGerente.length || m.midias.length || m.aprovacoes.length || m.agendamentos.length || m.perfil),
        );
        if (local && temConteudo && !localStorage.getItem("importacao-recusada")) setImportavel(completar(local));
      }
    },
    [],
  );

  const recarregarNuvem = useCallback(async () => {
    if (!MODO_NUVEM) return;
    try {
      const info = await api<InfoNuvem>("/api/conta");
      setNuvem(info);
      const config = configDoPlano(info);
      definirRaiz(mudarConta(ref.current, ref.current.contaAtiva, (c) => ({ ...c, config: { ...config } })));
    } catch {
      /* segue com o que tem */
    }
  }, [definirRaiz]);

  useEffect(() => {
    if (MODO_NUVEM) {
      const sb = supabase();
      let iniciou = false;
      const iniciar = async () => {
        if (iniciou) return;
        iniciou = true;
        try {
          // Abre na última conta usada (quem faz parte de uma equipe volta para ela).
          let salva: string | null = null;
          try {
            salva = localStorage.getItem("conta-ativa");
          } catch {}
          try {
            await carregarNuvem(salva ?? undefined);
          } catch (e) {
            if (!salva || (e as { codigo?: string }).codigo !== "sem_conta") throw e;
            await carregarNuvem();
          }
        } catch (e) {
          iniciou = false;
          const codigo = (e as { codigo?: string }).codigo;
          if (codigo === "sem_login") setSessao("sem_login");
          else setErroCarga(e instanceof Error ? e.message : String(e));
        } finally {
          setCarregado(true);
        }
      };
      sb.auth.getSession().then(({ data }) => {
        if (data.session) iniciar();
        else {
          setSessao("sem_login");
          setCarregado(true);
        }
      });
      const { data: sub } = sb.auth.onAuthStateChange((evento, s) => {
        if (evento === "SIGNED_IN" && s) iniciar();
        if (evento === "SIGNED_OUT") {
          iniciou = false;
          setSessao("sem_login");
          setNuvem(null);
        }
      });
      const aoSaldo = (e: Event) =>
        setNuvem((n) => (n ? { ...n, conta: { ...n.conta, saldo: (e as CustomEvent<number>).detail } } : n));
      const aoSessao = () => setSessao("sem_login");
      const aoSemCreditos = (e: Event) => {
        const corpo = (e as CustomEvent<{ error?: string }>).detail;
        avisar(corpo?.error ?? "Seus créditos acabaram. Veja em Plano e créditos.", "erro");
      };
      eventosNuvem?.addEventListener("saldo", aoSaldo);
      eventosNuvem?.addEventListener("sessao", aoSessao);
      eventosNuvem?.addEventListener("sem-creditos", aoSemCreditos);
      return () => {
        sub.subscription.unsubscribe();
        eventosNuvem?.removeEventListener("saldo", aoSaldo);
        eventosNuvem?.removeEventListener("sessao", aoSessao);
        eventosNuvem?.removeEventListener("sem-creditos", aoSemCreditos);
      };
    }
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
  }, [definirRaiz, carregarNuvem, avisar]);

  // Salva na hora se a aba ficar em segundo plano; ao voltar, traz o que mudou em outro aparelho.
  useEffect(() => {
    const aoMudar = async () => {
      if (document.visibilityState === "hidden") {
        if (timer.current) {
          clearTimeout(timer.current);
          salvarAgora();
        }
        return;
      }
      if (!MODO_NUVEM || !nuvem || sinc.current?.pendente(ref.current)) return;
      try {
        const { perfis } = await api<{ perfis: { id: string; dados: Marca; apagado: boolean; em: number }[] }>(
          `/api/perfis?desde=${ultimaSincronia.current}`,
        );
        if (!perfis.length) return;
        ultimaSincronia.current = perfis.reduce((m, p) => Math.max(m, p.em), ultimaSincronia.current);
        const r = mudarConta(ref.current, ref.current.contaAtiva, (c) => {
          let marcas = c.marcas.filter((m) => !perfis.some((p) => p.id === m.id && p.apagado));
          for (const p of perfis.filter((x) => !x.apagado)) {
            marcas = marcas.some((m) => m.id === p.id) ? marcas.map((m) => (m.id === p.id ? p.dados : m)) : [...marcas, p.dados];
          }
          return { ...c, marcas, marcaAtiva: marcas.some((m) => m.id === c.marcaAtiva) ? c.marcaAtiva : marcas[0]?.id };
        });
        ref.current = r;
        setRaiz(r);
        sinc.current?.marcarSalvo(r);
      } catch {
        /* tenta na próxima */
      }
    };
    const aoSair = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        salvarAgora();
      }
    };
    document.addEventListener("visibilitychange", aoMudar);
    window.addEventListener("pagehide", aoSair);
    return () => {
      document.removeEventListener("visibilitychange", aoMudar);
      window.removeEventListener("pagehide", aoSair);
    };
  }, [salvarAgora, nuvem]);

  const atualizar = useCallback(
    (fn: (e: Estado) => Estado) => definirRaiz(aplicarVisao(ref.current, fn(visao(ref.current)))),
    [definirRaiz],
  );
  const obter = useCallback(() => visao(ref.current), []);

  const salvarBlob = useCallback(async (id: string, blob: Blob) => {
    await db.gravar(`blob:${id}`, blob);
    if (MODO_NUVEM) enfileirarEnvio(id, blob);
  }, []);
  const lerBlob = useCallback(async (id: string) => {
    const local = await db.ler<Blob>(`blob:${id}`);
    if (local || !MODO_NUVEM) return local;
    try {
      const daNuvem = await baixarArquivo(id);
      if (daNuvem) await db.gravar(`blob:${id}`, daNuvem);
      return daNuvem;
    } catch {
      return undefined;
    }
  }, []);

  const registrarGasto = useCallback(
    (categoria: CategoriaGasto, usd: number) => {
      if (!usd) return;
      const mes = mesAtual();
      const antes = totalContaMes(ativos(ref.current).conta, mes) * ativos(ref.current).conta.config.cambio;
      atualizar((e) => {
        const atual = e.gastos[mes] ?? { claude: 0, gemini: 0, veo: 0, seedance: 0 };
        return { ...e, gastos: { ...e.gastos, [mes]: { ...atual, [categoria]: atual[categoria] + usd } } };
      });
      if (MODO_NUVEM) return; // na nuvem quem controla é a carteira de créditos
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
    (id: string) => {
      if (MODO_NUVEM) {
        if (timer.current) {
          clearTimeout(timer.current);
          salvarAgora();
        }
        carregarNuvem(id).catch((e) => avisar(e instanceof Error ? e.message : String(e), "erro"));
        return;
      }
      definirRaiz({ ...ref.current, contaAtiva: id });
    },
    [definirRaiz, carregarNuvem, salvarAgora, avisar],
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
      if (MODO_NUVEM) return;
      const atual = ativos(ref.current).conta.config;
      const config = d.copiarChaves ? { ...atual } : { ...atual, chaveAnthropic: "", chaveFal: "" };
      const conta = { ...novaConta(d.nome, d.email, config), cor: CORES[ref.current.contas.length % CORES.length] };
      definirRaiz({ ...ref.current, contas: [...ref.current.contas, conta], contaAtiva: conta.id });
    },
    [definirRaiz],
  );
  const editarConta = useCallback(
    (id: string, dados: Partial<Pick<Conta, "nome" | "email" | "cor">>) => {
      definirRaiz(mudarConta(ref.current, id, (c) => ({ ...c, ...dados })));
      if (MODO_NUVEM && dados.nome) void api("/api/conta", { metodo: "PATCH", corpo: { nome: dados.nome } }).catch(() => {});
    },
    [definirRaiz],
  );
  const removerConta = useCallback(
    (id: string) => {
      if (MODO_NUVEM) return;
      const contas = ref.current.contas.filter((c) => c.id !== id);
      if (!contas.length) return;
      definirRaiz({ ...ref.current, contas, contaAtiva: ref.current.contaAtiva === id ? contas[0].id : ref.current.contaAtiva });
    },
    [definirRaiz],
  );
  const criarMarca = useCallback(
    (d: { nome: string; arroba: string }) => {
      const { conta } = ativos(ref.current);
      if (MODO_NUVEM && nuvem && conta.marcas.length >= nuvem.recursos.max_perfis) {
        avisar(`Seu plano permite até ${nuvem.recursos.max_perfis} perfil(is). Mude de plano em Plano e créditos para criar mais.`, "erro");
        return;
      }
      const marca = novaMarca(d.nome, d.arroba, CORES[conta.marcas.length % CORES.length]);
      definirRaiz(mudarConta(ref.current, conta.id, (c) => ({ ...c, marcas: [...c.marcas, marca], marcaAtiva: marca.id })));
    },
    [definirRaiz, nuvem, avisar],
  );
  const editarMarca = useCallback(
    (id: string, dados: Partial<Pick<Marca, "nome" | "arroba" | "cor" | "perfil" | "redes" | "guia" | "guiaArquivo" | "respostasPerfil">>) => {
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
      if (MODO_NUVEM) void api(`/api/perfis?id=${encodeURIComponent(id)}`, { metodo: "DELETE" }).catch(() => {});
    },
    [definirRaiz],
  );

  /** Leva os perfis e arquivos que estavam só neste navegador para a nuvem. */
  const importarLocal = useCallback(async () => {
    const local = importavel;
    setImportavel(null);
    if (!local || !nuvem) return;
    const marcas = local.contas.flatMap((c) => c.marcas);
    const limite = nuvem.recursos.max_perfis;
    const escolhidas = marcas.slice(0, limite);
    definirOcupado(true);
    try {
      const atual = ativos(ref.current).conta;
      const vazias = atual.marcas.filter((m) => !m.chatGerente.length && !m.midias.length && !m.perfil);
      definirRaiz(
        mudarConta(ref.current, atual.id, (c) => {
          const ficam = c.marcas.filter((m) => !vazias.includes(m));
          const novas = [...ficam, ...escolhidas].slice(0, Math.max(limite, ficam.length));
          return { ...c, marcas: novas, marcaAtiva: novas[0].id };
        }),
      );
      vazias.forEach((m) => void api(`/api/perfis?id=${encodeURIComponent(m.id)}`, { metodo: "DELETE" }).catch(() => {}));
      let n = 0;
      const ids = escolhidas.flatMap((m) => m.midias.flatMap((x) => [x.id, ...Array.from({ length: x.quadros ?? 0 }, (_, i) => `${x.id}_q${i}`)]));
      for (const id of ids) {
        const b = await db.ler<Blob>(`blob:${id}`);
        if (b) enfileirarEnvio(id, b);
        definirTarefa(`Enviando arquivos para a nuvem: ${++n} de ${ids.length}`);
      }
      avisar(
        marcas.length > limite
          ? `Importei ${limite} de ${marcas.length} perfis (limite do seu plano). Os outros continuam neste navegador.`
          : `Importei ${marcas.length} perfil(is) para a nuvem.`,
        "ok",
      );
    } finally {
      definirTarefa(undefined);
      definirOcupado(false);
    }
  }, [importavel, nuvem, definirRaiz, definirOcupado, avisar]);

  const recusarImportacao = useCallback(() => {
    localStorage.setItem("importacao-recusada", "1");
    setImportavel(null);
  }, []);

  const sair = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      salvarAgora();
    }
    await supabase().auth.signOut();
  }, [salvarAgora]);

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
        ocupado: trabalhos > 0,
        definirOcupado,
        tarefa,
        definirTarefa,
        avisos,
        avisar,
        fecharAviso,
        nuvem,
        sessao,
        recarregarNuvem,
        importavel: !!importavel,
        importarLocal,
        recusarImportacao,
        sair,
        erroCarga,
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
