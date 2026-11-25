import type Anthropic from "@anthropic-ai/sdk";

export type MensagemClaude = Anthropic.Beta.BetaMessageParam;

export type Midia = {
  id: string;
  tipo: "imagem" | "video";
  titulo: string;
  prompt?: string;
  origem: "gemini" | "veo" | "seedance" | "upload";
  status: "pronto" | "gerando" | "erro";
  erro?: string;
  mime?: string;
  criadoEm: string;
  /** Para vídeos em produção: como consultar o andamento. */
  job?:
    | { provedor: "veo"; operacao: string }
    | { provedor: "seedance" | "fal"; endpoint: string; requestId: string };
  /** Imagem de IA liberada pelo usuário para servir de referência ao gerente. */
  referenciaAprovada?: boolean;
  /** Link externo, se o arquivo não pôde ser salvo localmente. */
  urlExterna?: string;
};

export type TipoConteudo = "post" | "carrossel" | "reels" | "story" | "planejamento" | "outro";

export type Aprovacao = {
  id: string;
  titulo: string;
  tipo: TipoConteudo;
  redes: string[];
  legenda: string;
  hashtags: string;
  dataPublicacao?: string; // "YYYY-MM-DDTHH:mm"
  midias: string[];
  observacoes?: string;
  status: "pendente" | "aprovado" | "reprovado" | "ajuste";
  feedback?: string;
  criadoEm: string;
};

export type StatusAgendamento = "a_programar" | "programado" | "postado" | "cancelado";

export type Agendamento = {
  id: string;
  aprovacaoId?: string;
  titulo: string;
  tipo: TipoConteudo;
  redes: string[];
  legenda: string;
  hashtags: string;
  data: string; // "YYYY-MM-DDTHH:mm"
  midias: string[];
  status: StatusAgendamento;
  criadoEm: string;
  atualizadoEm: string;
};

export type ParteGemini = { texto: string } | { midiaId: string };
export type MensagemGemini = { papel: "user" | "model"; partes: ParteGemini[] };

export type Configuracoes = {
  chaveAnthropic: string;
  chaveGoogle: string;
  chaveFal: string;
  modeloClaude: string;
  esforcoGerente: "low" | "medium" | "high" | "xhigh" | "max";
  /** De onde saem as imagens e os vídeos do Veo: fal.ai ou Google direto. */
  provedorImagem: "fal" | "google";
  modeloImagemFal: string;
  provedorVeo: "fal" | "google";
  modeloVeoFal: string;
  modeloGeminiTexto: string;
  modeloGeminiImagem: string;
  modeloVeo: string;
  prefixoSeedance: string;
  resolucaoSeedance: string;
  confirmarVideos: boolean;
  perfilMarca: string;
  // Preços em dólar para a estimativa de gastos
  cambio: number;
  precoImagem: number;
  precoVeoSegundo: number;
  segundosVeo: number;
  precoSeedanceSegundo: number;
  segundosSeedance: number;
};

export type Gastos = Record<string, { claude: number; gemini: number; veo: number; seedance: number }>;

export type Estado = {
  config: Configuracoes;
  midias: Midia[];
  aprovacoes: Aprovacao[];
  agendamentos: Agendamento[];
  chatGerente: MensagemClaude[];
  chatClaude: MensagemClaude[];
  chatGemini: MensagemGemini[];
  gastos: Gastos;
};

export const REDES = ["Instagram", "TikTok", "Facebook", "YouTube", "Pinterest", "Threads"];

export const CONFIG_PADRAO: Configuracoes = {
  chaveAnthropic: "",
  chaveGoogle: "",
  chaveFal: "",
  modeloClaude: "claude-opus-5-5",
  esforcoGerente: "medium",
  provedorImagem: "fal",
  modeloImagemFal: "fal-ai/nano-banana-2",
  provedorVeo: "fal",
  modeloVeoFal: "fal-ai/veo3.1/fast",
  modeloGeminiTexto: "gemini-flash-latest",
  modeloGeminiImagem: "gemini-nano-banana-2.1",
  modeloVeo: "veo-3.1-fast-generate-preview",
  prefixoSeedance: "bytedance/seedance-2.5",
  resolucaoSeedance: "720p",
  confirmarVideos: true,
  perfilMarca: "",
  cambio: 5.3,
  precoImagem: 0.08,
  precoVeoSegundo: 0.15,
  segundosVeo: 8,
  precoSeedanceSegundo: 0.47,
  segundosSeedance: 5,
};

export const ESTADO_INICIAL: Estado = {
  config: CONFIG_PADRAO,
  midias: [],
  aprovacoes: [],
  agendamentos: [],
  chatGerente: [],
  chatClaude: [],
  chatGemini: [],
  gastos: {},
};

/** Preço em dólar por milhão de tokens (entrada, saída). */
export const PRECOS_CLAUDE: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};
