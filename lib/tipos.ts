import type Anthropic from "@anthropic-ai/sdk";

export type MensagemClaude = Anthropic.Beta.BetaMessageParam;

export type Midia = {
  id: string;
  tipo: "imagem" | "video";
  titulo: string;
  prompt?: string;
  /** "gemini" = imagem gerada por IA (Nano Banana). Nome mantido por compatibilidade. */
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
  favorita?: boolean;
  /** Biblioteca de referências (arquivos do usuário organizados em pastas). */
  naBiblioteca?: boolean;
  pasta?: string;
  descricao?: string;
  tags?: string;
  /** Quantos quadros (miniaturas) foram extraídos do vídeo para o Claude enxergar. */
  quadros?: number;
  duracao?: number;
  driveId?: string;
  /** Endereço do arquivo já enviado ao fal.ai (reaproveitado por alguns dias). */
  falUrl?: string;
  falUrlEm?: string;
  /** Acompanhamento ao vivo da produção (vídeos). */
  iniciadoEm?: string;
  prontoEm?: string;
  fase?: "fila" | "produzindo" | "baixando";
  posicaoFila?: number;
  detalhe?: string;
  pedidoPor?: "gerente" | "voce";
  imagemInicial?: string;
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
  /** Publicação automática no Instagram (modo nuvem). */
  publicarAuto?: boolean;
  publicacao?: { status: "agendada" | "publicando" | "publicada" | "erro" | "cancelada"; permalink?: string | null; erro?: string | null };
};

export type ParteGemini = { texto: string } | { midiaId: string };
export type MensagemGemini = { papel: "user" | "model"; partes: ParteGemini[] };

export type Ideia = { id: string; texto: string; feita: boolean; criadoEm: string };
export type TextoSalvo = { id: string; titulo: string; texto: string; tipo: "hashtags" | "legenda" | "cta" | "outro" };

/** Configurações da conta (chaves, modelos, preços). Valem para todos os perfis da conta. */
export type Configuracoes = {
  chaveAnthropic: string;
  chaveFal: string;
  /** Chave de API do Google Cloud só para ler pastas públicas do Google Drive (opcional). */
  chaveDrive: string;
  modeloClaude: string;
  esforcoGerente: "low" | "medium" | "high" | "xhigh" | "max";
  modeloImagemFal: string;
  modeloVeoFal: string;
  prefixoSeedance: string;
  resolucaoSeedance: string;
  confirmarVideos: boolean;
  /** Teto de gasto mensal da conta, em reais (0 = sem teto). */
  orcamentoMensal: number;
  // Preços em dólar para a estimativa de gastos
  cambio: number;
  precoImagem: number;
  precoVeoSegundo: number;
  segundosVeo: number;
  precoSeedanceSegundo: number;
  segundosSeedance: number;
};

export type CategoriaGasto = "claude" | "gemini" | "veo" | "seedance";
export type Gastos = Record<string, Record<CategoriaGasto, number>>;

/** Um perfil de rede social (uma marca / cliente) dentro de uma conta. */
export type Marca = {
  id: string;
  nome: string;
  arroba: string;
  cor: string;
  /** Texto do perfil da marca (nicho, público, tom de voz...) usado pelo gerente. */
  perfil: string;
  redes: { instagram?: string; tiktok?: string; facebook?: string; youtube?: string };
  criadoEm: string;
  midias: Midia[];
  aprovacoes: Aprovacao[];
  agendamentos: Agendamento[];
  chatGerente: MensagemClaude[];
  chatClaude: MensagemClaude[];
  chatGemini: MensagemGemini[];
  ideias: Ideia[];
  textos: TextoSalvo[];
  gastos: Gastos;
};

/** Conta principal (a pessoa / social media), com as próprias chaves e vários perfis. */
export type Conta = {
  id: string;
  nome: string;
  email: string;
  cor: string;
  config: Configuracoes;
  marcas: Marca[];
  marcaAtiva: string;
};

export type Raiz = { versao: 2; contas: Conta[]; contaAtiva: string };

/** Visão usada pelas telas: o perfil ativo + as configurações da conta ativa. */
export type Estado = {
  config: Configuracoes & { perfilMarca: string };
  midias: Midia[];
  aprovacoes: Aprovacao[];
  agendamentos: Agendamento[];
  chatGerente: MensagemClaude[];
  chatClaude: MensagemClaude[];
  chatGemini: MensagemGemini[];
  ideias: Ideia[];
  textos: TextoSalvo[];
  gastos: Gastos;
};

export const REDES = ["Instagram", "TikTok", "Facebook", "YouTube", "Pinterest", "Threads"];

export const CORES = ["#8b5cf6", "#06b6d4", "#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#84cc16"];

export const CONFIG_PADRAO: Configuracoes = {
  chaveAnthropic: "",
  chaveFal: "",
  chaveDrive: "",
  modeloClaude: "claude-opus-5-5",
  esforcoGerente: "medium",
  modeloImagemFal: "fal-ai/nano-banana-2",
  modeloVeoFal: "fal-ai/veo3.1/fast",
  prefixoSeedance: "bytedance/seedance-2.5",
  resolucaoSeedance: "720p",
  confirmarVideos: true,
  orcamentoMensal: 0,
  cambio: 5.3,
  precoImagem: 0.08,
  precoVeoSegundo: 0.15,
  segundosVeo: 8,
  precoSeedanceSegundo: 0.47,
  segundosSeedance: 5,
};

/** Preço em dólar por milhão de tokens (entrada, saída). */
export const PRECOS_CLAUDE: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};
