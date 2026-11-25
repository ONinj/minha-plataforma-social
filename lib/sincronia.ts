"use client";

import { api, definirContaAtual, enviarArquivo, idContaAtual } from "./nuvem";
import { CONFIG_PADRAO, CORES, type Configuracoes, type Conta, type Marca, type Raiz } from "./tipos";

/** Resposta de /api/conta (modo nuvem). */
export type InfoNuvem = {
  modo: "nuvem";
  usuario: { id: string; email: string; admin: boolean };
  conta: {
    id: string;
    nome: string;
    plano_id: string;
    status: string;
    saldo: number;
    preferencias: Partial<Configuracoes>;
    papel: string;
    asaas_cliente: string | null;
    asaas_assinatura: string | null;
    renova_em: string | null;
    plano_pendente: string | null;
  };
  plano: { id: string; nome: string; preco: number; creditos_mensais: number };
  recursos: {
    max_perfis: number;
    claude: string[];
    imagem: string[];
    veo: string[];
    seedance: boolean;
    biblioteca: boolean;
    drive: boolean;
    esforco_max: string;
    instagram?: boolean;
  };
  cambio: number;
  precos: {
    imagem: Record<string, number>;
    veo_por_segundo: Record<string, number>;
    segundos_veo: number;
    seedance_por_segundo: Record<string, number>;
    segundos_seedance: number;
  };
  contas: { id: string; nome: string; plano_id: string; papel: string }[];
  planos: { id: string; nome: string; preco: number; creditos_mensais: number; recursos: InfoNuvem["recursos"] }[];
  whatsapp: string;
  cobranca: boolean;
  instagramConfigurado: boolean;
  metricoolConfigurado?: boolean;
  criptoConfigurada?: boolean;
};

const PREFS: (keyof Configuracoes)[] = [
  "modeloClaude",
  "esforcoGerente",
  "modeloImagemFal",
  "modeloVeoFal",
  "prefixoSeedance",
  "resolucaoSeedance",
  "confirmarVideos",
  "orcamentoMensal",
  "chaveDrive",
];

export function preferenciasDe(config: Configuracoes): Partial<Configuracoes> {
  return Object.fromEntries(PREFS.map((k) => [k, config[k]])) as Partial<Configuracoes>;
}

/** Ajusta as escolhas de modelo para o que o plano permite. */
export function configDoPlano(info: InfoNuvem): Configuracoes {
  const c: Configuracoes = { ...CONFIG_PADRAO, ...info.conta.preferencias, chaveAnthropic: "", chaveFal: "", cambio: info.cambio };
  const r = info.recursos;
  if (!r.claude.includes(c.modeloClaude)) c.modeloClaude = r.claude.find((m) => m.includes("sonnet")) ?? r.claude[0];
  if (!r.imagem.includes(c.modeloImagemFal)) c.modeloImagemFal = r.imagem[0];
  if (!r.veo.includes(c.modeloVeoFal)) c.modeloVeoFal = r.veo.find((m) => m.includes("fast")) ?? r.veo[0];
  const ordem = ["low", "medium", "high", "xhigh", "max"];
  if (ordem.indexOf(c.esforcoGerente) > ordem.indexOf(r.esforco_max)) c.esforcoGerente = r.esforco_max as Configuracoes["esforcoGerente"];
  // Preços (em dólar) usados nas estimativas mostradas antes de gerar.
  c.precoImagem = info.precos.imagem[c.modeloImagemFal] ?? c.precoImagem;
  c.precoVeoSegundo = info.precos.veo_por_segundo[c.modeloVeoFal] ?? c.precoVeoSegundo;
  c.segundosVeo = info.precos.segundos_veo;
  c.precoSeedanceSegundo = info.precos.seedance_por_segundo[c.resolucaoSeedance] ?? c.precoSeedanceSegundo;
  c.segundosSeedance = info.precos.segundos_seedance;
  return c;
}

type LinhaPerfil = { id: string; dados: Marca; versao: number; apagado: boolean; em: number };

/** Monta o estado da plataforma a partir da nuvem (a conta ativa vem com os perfis). */
export async function carregarDaNuvem(contaPedida?: string): Promise<{ raiz: Raiz; info: InfoNuvem; ultimo: number }> {
  definirContaAtual(contaPedida ?? null);
  const info = await api<InfoNuvem>("/api/conta");
  definirContaAtual(info.conta.id);
  const { perfis } = await api<{ perfis: LinhaPerfil[] }>("/api/perfis");
  const marcas = perfis.filter((p) => !p.apagado).map((p) => p.dados);
  const ultimo = perfis.reduce((m, p) => Math.max(m, p.em), 0);
  if (!marcas.length) {
    // Conta nova: cria o primeiro perfil já salvo na nuvem (o id precisa ser o mesmo em toda visita).
    const primeira = marcaVazia("Meu primeiro perfil");
    await api("/api/perfis", { metodo: "PUT", corpo: { id: primeira.id, dados: primeira } }).catch(() => {});
    marcas.push(primeira);
  }
  const salvaAtiva = typeof localStorage !== "undefined" ? localStorage.getItem(`perfil-ativo:${info.conta.id}`) : null;
  const contas: Conta[] = info.contas.map((c, i) => ({
    id: c.id,
    nome: c.id === info.conta.id ? info.conta.nome : c.nome,
    email: info.usuario.email,
    cor: CORES[(i + 1) % CORES.length],
    config: configDoPlano(info),
    marcas: c.id === info.conta.id ? marcas : [],
    marcaAtiva: c.id === info.conta.id ? (marcas.find((m) => m.id === salvaAtiva)?.id ?? marcas[0].id) : "",
  }));
  return { raiz: { versao: 2, contas, contaAtiva: info.conta.id }, info, ultimo };
}

export function marcaVazia(nome: string): Marca {
  return {
    id: `mar_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    nome,
    arroba: "",
    cor: CORES[0],
    perfil: "",
    redes: {},
    criadoEm: new Date().toISOString(),
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

const LIMITE_BYTES = 4_000_000;

/**
 * Salva na nuvem só o que mudou: cada perfil é comparado com a última versão salva,
 * e as preferências da conta vão à parte.
 */
export class Sincronizador {
  private salvos = new Map<string, string>();
  private prefsSalvas = "";
  private emAndamento = false;
  private deNovo = false;
  constructor(
    private aoErro: (msg: string) => void,
    private aoLimite: (msg: string) => void,
  ) {}

  marcarSalvo(raiz: Raiz) {
    const conta = raiz.contas.find((c) => c.id === raiz.contaAtiva);
    if (!conta) return;
    this.salvos.clear();
    for (const m of conta.marcas) this.salvos.set(m.id, JSON.stringify(m));
    this.prefsSalvas = JSON.stringify(preferenciasDe(conta.config));
  }

  async salvar(raiz: Raiz) {
    if (this.emAndamento) {
      this.deNovo = true;
      return;
    }
    this.emAndamento = true;
    try {
      const conta = raiz.contas.find((c) => c.id === raiz.contaAtiva);
      if (!conta || conta.id !== idContaAtual()) return;
      for (const m of conta.marcas) {
        const json = JSON.stringify(m);
        if (this.salvos.get(m.id) === json) continue;
        if (json.length > LIMITE_BYTES) {
          this.aoLimite(`O perfil "${m.nome}" ficou grande demais para salvar na nuvem. Limpe a conversa da Central ou do Claude dele em Configurações.`);
          continue;
        }
        try {
          await api("/api/perfis", { metodo: "PUT", corpo: { id: m.id, dados: m } });
          this.salvos.set(m.id, json);
        } catch (e) {
          this.aoErro(e instanceof Error ? e.message : String(e));
          this.salvos.set(m.id, json); // não insiste no mesmo erro a cada mudança
        }
      }
      const prefs = JSON.stringify(preferenciasDe(conta.config));
      if (prefs !== this.prefsSalvas) {
        await api("/api/conta", { metodo: "PATCH", corpo: { preferencias: JSON.parse(prefs) } }).catch(() => {});
        this.prefsSalvas = prefs;
      }
    } finally {
      this.emAndamento = false;
      if (this.deNovo) {
        this.deNovo = false;
        this.salvar(raiz);
      }
    }
  }

  pendente(raiz: Raiz) {
    const conta = raiz.contas.find((c) => c.id === raiz.contaAtiva);
    return !!conta?.marcas.some((m) => this.salvos.get(m.id) !== JSON.stringify(m));
  }
}

// ---------------- Envio dos arquivos para a nuvem ----------------

const fila: { id: string; blob: Blob }[] = [];
let enviando = 0;
export function enfileirarEnvio(id: string, blob: Blob) {
  fila.push({ id, blob });
  void processarFila();
}
async function processarFila() {
  while (enviando < 2 && fila.length) {
    const item = fila.shift()!;
    enviando++;
    enviarArquivo(item.id, item.blob)
      .catch(async (e) => {
        console.warn("Falha ao enviar arquivo, tentando de novo em 20 s", item.id, e);
        await new Promise((r) => setTimeout(r, 20000));
        fila.push(item);
      })
      .finally(() => {
        enviando--;
        void processarFila();
      });
  }
}
export function arquivosNaFila() {
  return fila.length + enviando;
}
