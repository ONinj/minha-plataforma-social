import "server-only";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import postgres from "postgres";
import { urlSupabase } from "../supabaseUrl";

/**
 * Modo nuvem: ligado quando o Supabase está configurado. Sem ele, a plataforma
 * funciona como antes (cada pessoa usa as próprias chaves no navegador).
 */
export const MODO_NUVEM = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

let _sql: postgres.Sql | null = null;
export function sql(): postgres.Sql {
  if (!_sql) {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) throw new Error("DATABASE_URL não configurada.");
    // prepare:false é necessário com o pooler do Supabase (modo transação).
    _sql = postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 });
  }
  return _sql;
}

export class ErroHttp extends Error {
  constructor(
    public status: number,
    message: string,
    public codigo?: string,
  ) {
    super(message);
  }
}

export function responderErro(e: unknown) {
  if (e instanceof ErroHttp) return Response.json({ error: e.message, codigo: e.codigo }, { status: e.status });
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("saldo_insuficiente")) {
    return Response.json({ error: "Seus créditos acabaram. Faça uma recarga ou mude de plano.", codigo: "sem_creditos" }, { status: 402 });
  }
  console.error(e);
  return Response.json({ error: msg }, { status: 500 });
}

// ---------------- Login (token do Supabase) ----------------

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function verificarToken(token: string): Promise<JWTPayload> {
  const segredo = process.env.SUPABASE_JWT_SECRET?.trim();
  try {
    if (segredo) return (await jwtVerify(token, new TextEncoder().encode(segredo))).payload;
    if (!jwks) jwks = createRemoteJWKSet(new URL(`${urlSupabase()}/auth/v1/.well-known/jwks.json`));
    return (await jwtVerify(token, jwks)).payload;
  } catch (erroLocal) {
    // Plano B: pergunta ao próprio Supabase quem é o dono do token (funciona com qualquer tipo de chave).
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!chave) throw erroLocal;
    const r = await fetch(`${urlSupabase()}/auth/v1/user`, { headers: { apikey: chave, Authorization: `Bearer ${token}` } });
    if (!r.ok) throw erroLocal;
    const u = (await r.json()) as { id: string; email?: string };
    return { sub: u.id, email: u.email } as JWTPayload;
  }
}

export type Recursos = {
  max_perfis: number;
  claude: string[];
  imagem: string[];
  veo: string[];
  seedance: boolean;
  biblioteca: boolean;
  drive: boolean;
  esforco_max: "low" | "medium" | "high" | "xhigh" | "max";
  instagram?: boolean;
  /** Resoluções do Seedance liberadas (sem a lista = todas). */
  seedance_resolucoes?: string[];
  /** Parte dos créditos do plano que acumula para o mês seguinte (0 a 1). */
  acumulo?: number;
  /** Desconto nas recargas avulsas (0 a 1). */
  desconto_recarga?: number;
  /** Benefícios extras mostrados na lista do plano. */
  extras?: string[];
  /** Publicações automáticas por mês, por perfil (sem = sem limite). */
  publicacao_mensal?: { reels: number; stories: number; posts: number } | null;
  /** Quantos perfis podem ter publicação automática pela plataforma. */
  perfis_publicacao?: number;
};

export type Precos = {
  claude: Record<string, [number, number]>;
  imagem: Record<string, number>;
  veo_por_segundo: Record<string, number>;
  segundos_veo: number;
  seedance_por_segundo: Record<string, number>;
  segundos_seedance: number;
  seedance_referencia_fator: number;
  whisper_por_minuto: number;
  margem_seguranca: number;
};

export type Contexto = {
  userId: string;
  email: string;
  admin: boolean;
  conta: {
    id: string;
    nome: string;
    plano_id: string;
    status: string;
    saldo: number;
    preferencias: Record<string, unknown>;
    asaas_cliente: string | null;
    asaas_assinatura: string | null;
    email_cobranca: string | null;
    renova_em: string | null;
  };
  papel: string;
  plano: { id: string; nome: string; preco: number; creditos_mensais: number };
  recursos: Recursos;
  precos: Precos;
  cambio: number;
};

export function eAdmin(email: string) {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

/** Identifica quem chamou (token), a conta escolhida (x-conta-id) e o plano dela. */
export async function contexto(req: Request, opcoes: { criarSeNaoExistir?: boolean } = {}): Promise<Contexto> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new ErroHttp(401, "Faça login para continuar.", "sem_login");
  let payload: JWTPayload;
  try {
    payload = await verificarToken(token);
  } catch {
    throw new ErroHttp(401, "Sua sessão expirou. Entre de novo.", "sem_login");
  }
  const userId = String(payload.sub);
  const email = String((payload as { email?: string }).email ?? "");
  const db = sql();

  if (opcoes.criarSeNaoExistir) {
    const nome = email.split("@")[0] || "Minha conta";
    await db`select criar_conta_inicial(${userId}::uuid, ${nome}, ${email})`;
  }

  const pedida = req.headers.get("x-conta-id");
  const linhas = await db`
    select c.*, m.papel from contas c join membros m on m.conta_id = c.id
    where m.user_id = ${userId}::uuid ${pedida ? db`and c.id = ${pedida}::uuid` : db``}
    order by m.criado_em limit 1`;
  if (!linhas.length) throw new ErroHttp(403, "Você não tem acesso a esta conta.", "sem_conta");
  const c = linhas[0];

  const [plano] = await db`select * from planos where id = ${c.plano_id}`;
  const [cfg] = await db`select cambio, precos from config_global where id = 1`;
  const recursos = { ...(plano.recursos as Recursos), ...((c.recursos_custom as Partial<Recursos>) ?? {}) };

  return {
    userId,
    email,
    admin: eAdmin(email),
    papel: c.papel,
    conta: {
      id: c.id,
      nome: c.nome,
      plano_id: c.plano_id,
      status: c.status,
      saldo: Number(c.saldo),
      preferencias: c.preferencias ?? {},
      asaas_cliente: c.asaas_cliente,
      asaas_assinatura: c.asaas_assinatura,
      email_cobranca: c.email_cobranca,
      renova_em: c.renova_em ? new Date(c.renova_em).toISOString() : null,
    },
    plano: {
      id: plano.id,
      nome: plano.nome,
      preco: Number(c.preco_custom ?? plano.preco),
      creditos_mensais: Number(c.creditos_mensais_custom ?? plano.creditos_mensais),
    },
    recursos,
    precos: cfg.precos as Precos,
    cambio: Number(cfg.cambio),
  };
}

// ---------------- Créditos ----------------

/** 1 crédito = R$ 0,10 de custo de IA. */
export function usdParaCreditos(ctx: Contexto, usd: number): number {
  return Math.round(((usd * ctx.cambio) / 0.1) * (ctx.precos.margem_seguranca ?? 1) * 1000) / 1000;
}

/** Confere se a conta pode usar a IA agora e se tem pelo menos `creditos`. */
export function exigirSaldo(ctx: Contexto, creditos: number) {
  if (ctx.conta.status === "atrasado") {
    throw new ErroHttp(402, "Há um pagamento em aberto. Regularize em Plano e créditos para continuar.", "atrasado");
  }
  if (ctx.conta.status === "cancelado" && ctx.conta.saldo <= 0) {
    throw new ErroHttp(402, "Sua assinatura foi cancelada. Escolha um plano para continuar.", "cancelado");
  }
  if (ctx.conta.saldo < creditos) {
    throw new ErroHttp(
      402,
      `Créditos insuficientes: esta ação usa cerca de ${creditos.toFixed(1)} e você tem ${ctx.conta.saldo.toFixed(1)}. Faça uma recarga ou mude de plano.`,
      "sem_creditos",
    );
  }
}

export async function debitar(
  ctx: Contexto,
  creditos: number,
  descricao: string,
  opcoes: { ref?: string; custoUsd?: number; permitirNegativo?: boolean } = {},
): Promise<number> {
  const [r] = await sql()`select debitar(${ctx.conta.id}::uuid, ${ctx.userId}::uuid, ${creditos}, ${descricao},
    ${opcoes.ref ?? null}, ${opcoes.custoUsd ?? null}, ${opcoes.permitirNegativo ?? false}) as saldo`;
  ctx.conta.saldo = Number(r.saldo);
  return ctx.conta.saldo;
}

/** Devolve os créditos de uma ação que falhou (ex.: vídeo que não ficou pronto). Idempotente. */
export async function estornar(ctx: Contexto, ref: string, descricao: string) {
  const db = sql();
  const [uso] = await db`select creditos from movimentos where conta_id = ${ctx.conta.id}::uuid and tipo = 'uso' and ref = ${ref} limit 1`;
  if (!uso) return;
  await db`select creditar(${ctx.conta.id}::uuid, ${-Number(uso.creditos)}, 'estorno', ${descricao}, ${ref}, ${ctx.userId}::uuid)`;
}

export function exigirRecurso(condicao: boolean, mensagem: string) {
  if (!condicao) throw new ErroHttp(403, `${mensagem} Mude de plano para liberar.`, "plano");
}

/** Chaves das IAs: no modo nuvem vêm do servidor; no modo local, do navegador. */
export function chaveAnthropic(req: Request) {
  return MODO_NUVEM ? process.env.ANTHROPIC_API_KEY : req.headers.get("x-anthropic-key");
}
export function chaveFal(req: Request) {
  return MODO_NUVEM ? process.env.FAL_KEY : req.headers.get("x-fal-key");
}

/** Cabeçalho para o cliente saber o saldo atualizado. */
export function comSaldo(resposta: Response, ctx: Contexto | null): Response {
  if (ctx) resposta.headers.set("x-saldo", String(ctx.conta.saldo));
  return resposta;
}
