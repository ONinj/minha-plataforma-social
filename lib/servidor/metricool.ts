import "server-only";
import { sql } from "./contexto";
import { cifrar, decifrar } from "./cripto";

const BASE = () => (process.env.METRICOOL_API_URL ?? "https://app.metricool.com/api").replace(/\/+$/, "");
const FUSO = "America/Sao_Paulo";

export type Credencial = { userId: string; token: string; origem: "plataforma" | "propria" };

export function plataformaConfigurada() {
  return !!(process.env.METRICOOL_USER_TOKEN?.trim() && process.env.METRICOOL_USER_ID?.trim());
}

export function credencialDaPlataforma(): Credencial | null {
  if (!plataformaConfigurada()) return null;
  return { userId: process.env.METRICOOL_USER_ID!.trim(), token: process.env.METRICOOL_USER_TOKEN!.trim(), origem: "plataforma" };
}

/** Metricool próprio da conta (se tiver); senão o da plataforma. */
export async function credencialDaConta(contaId: string): Promise<Credencial | null> {
  const [p] = await sql()`select user_id, token_cifrado from metricool_contas where conta_id = ${contaId}::uuid`;
  if (p) return { userId: p.user_id, token: decifrar(p.token_cifrado), origem: "propria" };
  return credencialDaPlataforma();
}

export async function salvarCredencialPropria(contaId: string, userId: string, token: string) {
  await sql()`insert into metricool_contas (conta_id, user_id, token_cifrado) values (${contaId}::uuid, ${userId}, ${cifrar(token)})
    on conflict (conta_id) do update set user_id = excluded.user_id, token_cifrado = excluded.token_cifrado, atualizado_em = now()`;
}

async function chamar(c: Credencial, caminho: string, op: { metodo?: string; query?: Record<string, string>; corpo?: unknown } = {}) {
  const q = new URLSearchParams({ userId: c.userId, ...(op.query ?? {}) });
  const r = await fetch(`${BASE()}${caminho}?${q}`, {
    method: op.metodo ?? "GET",
    headers: { "X-Mc-Auth": c.token, "Content-Type": "application/json", Accept: "application/json" },
    body: op.corpo ? JSON.stringify(op.corpo) : undefined,
  });
  const texto = await r.text();
  let j: unknown = null;
  try {
    j = texto ? JSON.parse(texto) : null;
  } catch {
    j = texto;
  }
  if (!r.ok) {
    const msg = typeof j === "object" && j ? ((j as { message?: string; error?: string }).message ?? (j as { error?: string }).error) : String(j);
    throw new Error(`Metricool (${r.status}): ${msg || "erro"}`.slice(0, 400));
  }
  return j as Record<string, unknown> & { data?: unknown };
}

export type Marca = { blogId: string; nome: string; redes: Record<string, string> };

/** Lista as marcas da conta do Metricool, com as redes conectadas em cada uma. */
export async function listarMarcas(c: Credencial): Promise<Marca[]> {
  const j = await chamar(c, "/admin/simpleProfiles");
  const lista = (Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : []) as Record<string, unknown>[];
  const REDES = ["instagram", "facebook", "tiktok", "youtube", "linkedinCompany", "twitter", "threads", "pinterest", "bluesky", "gmb"];
  return lista.map((p) => ({
    blogId: String(p.id ?? p.blogId),
    nome: String(p.label ?? p.title ?? p.name ?? `Marca ${p.id}`),
    redes: Object.fromEntries(REDES.filter((r) => p[r]).map((r) => [r, String(p[r])])),
  }));
}

const REDE: Record<string, string> = { Instagram: "instagram", Facebook: "facebook", TikTok: "tiktok", Threads: "threads" };

function horaLocal(iso: string) {
  // "YYYY-MM-DD HH:mm:ss" no fuso de São Paulo → "YYYY-MM-DDTHH:mm:ss"
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(iso)).replace(" ", "T");
}

/** Agenda no Metricool (ele publica sozinho na hora). Devolve o id do post no Metricool. */
export async function agendar(
  c: Credencial,
  blogId: string,
  p: { quando: string; tipo: "post" | "carrossel" | "reels" | "story"; legenda: string; midias: string[]; redes: string[] },
): Promise<string> {
  const redes = [...new Set(p.redes.map((r) => REDE[r]).filter(Boolean))];
  if (!redes.length) redes.push("instagram");
  const tipoIG = p.tipo === "reels" ? "REEL" : p.tipo === "story" ? "STORY" : "POST";
  const corpo: Record<string, unknown> = {
    autoPublish: true,
    draft: false,
    text: p.tipo === "story" && redes.length === 1 ? "" : p.legenda,
    media: p.midias,
    mediaAltText: [],
    descendants: [],
    firstCommentText: "",
    hasNotReadNotes: false,
    shortener: false,
    smartLinkData: { ids: [] },
    publicationDate: { dateTime: horaLocal(p.quando), timezone: FUSO },
    providers: redes.map((network) => ({ network })),
  };
  if (redes.includes("instagram")) corpo.instagramData = { type: tipoIG, showReelOnFeed: true, isAiGenerated: false };
  if (redes.includes("facebook")) corpo.facebookData = { type: tipoIG === "REEL" ? "REEL" : tipoIG };
  if (redes.includes("tiktok")) corpo.tiktokData = {};
  if (redes.includes("threads")) corpo.threadsData = {};
  const j = await chamar(c, "/v2/scheduler/posts", { metodo: "POST", query: { blogId }, corpo });
  const d = (j?.data ?? j) as Record<string, unknown>;
  const id = d?.id ?? (Array.isArray(d) ? (d[0] as { id?: unknown })?.id : undefined);
  if (!id) throw new Error("O Metricool não devolveu o id do post.");
  return String(id);
}

/** Situação do post no Metricool: agendada, publicada ou erro (com o motivo, se houver). */
export async function consultar(c: Credencial, blogId: string, id: string) {
  const j = await chamar(c, `/v2/scheduler/posts/${encodeURIComponent(id)}`, { query: { blogId } });
  const d = ((j?.data ?? j) ?? {}) as Record<string, unknown>;
  const provs = (Array.isArray(d.providers) ? d.providers : []) as Record<string, unknown>[];
  const estados = [d.status, d.state, ...provs.map((p) => p.status ?? p.state)].map((s) => String(s ?? "").toUpperCase());
  const link = provs.map((p) => p.publicUrl ?? p.url ?? p.link).find(Boolean) as string | undefined;
  const erro = provs.map((p) => p.detailedStatus ?? p.error ?? p.errorMessage).find(Boolean) as string | undefined;
  if (estados.some((s) => s.includes("ERROR") || s.includes("FAIL"))) return { status: "erro" as const, erro: erro ?? "O Metricool não conseguiu publicar." };
  if (estados.some((s) => s.includes("PUBLISH") && !s.includes("PENDING")) || link) return { status: "publicada" as const, link: link ?? null };
  return { status: "agendada" as const };
}

export async function cancelar(c: Credencial, blogId: string, id: string) {
  await chamar(c, `/v2/scheduler/posts/${encodeURIComponent(id)}`, { metodo: "DELETE", query: { blogId } });
}

/** Credencial a usar para um perfil (conforme a origem da marca mapeada). */
export async function marcaDoPerfil(perfilId: string, contaId: string) {
  const [m] = await sql()`select blog_id, origem from metricool_marcas where perfil_id = ${perfilId} and conta_id = ${contaId}::uuid`;
  if (!m) return null;
  const cred = m.origem === "propria" ? await credencialDaConta(contaId) : credencialDaPlataforma();
  if (!cred || cred.origem !== m.origem) return null;
  return { blogId: m.blog_id as string, cred };
}
