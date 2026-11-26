import "server-only";
import { type Contexto, ErroHttp, sql } from "./contexto";

export type Categoria = "reels" | "stories" | "posts";
export type Uso = Record<Categoria, number>;
const FUSO = "America/Sao_Paulo";
const NOME: Record<Categoria, string> = { reels: "reels", stories: "stories", posts: "posts no feed" };

export function categoria(tipo: string): Categoria {
  if (tipo === "reels") return "reels";
  if (tipo === "story") return "stories";
  return "posts";
}

/** "2026-12" da data, no horário de Brasília. */
export function mesDe(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: FUSO, year: "numeric", month: "2-digit" }).format(d);
}

export function nomeDoMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Publicações automáticas pela plataforma (sem contar o Metricool próprio) de um perfil, por mês. */
export async function usoPorMes(contaId: string, perfilId: string, meses: string[], ignorar?: string): Promise<Record<string, Uso>> {
  const linhas = await sql()`select to_char(quando at time zone ${FUSO}, 'YYYY-MM') as mes, tipo, count(*)::int as n
    from publicacoes
    where conta_id = ${contaId}::uuid and perfil_id = ${perfilId} and origem <> 'propria'
      and status in ('agendada', 'publicando', 'publicada') and id <> ${ignorar ?? ""}
      and to_char(quando at time zone ${FUSO}, 'YYYY-MM') in ${sql()(meses)}
    group by 1, 2`;
  const r: Record<string, Uso> = Object.fromEntries(meses.map((m) => [m, { reels: 0, stories: 0, posts: 0 }]));
  for (const l of linhas) r[l.mes][categoria(l.tipo)] += l.n;
  return r;
}

/** Barra a publicação se o perfil já usou o limite do plano naquele mês. */
export async function conferirCota(ctx: Contexto, perfilId: string, tipo: string, quando: Date, idPublicacao: string) {
  const limites = ctx.recursos.publicacao_mensal;
  if (!limites) return; // sem limite (Premium e Empresa)
  const cat = categoria(tipo);
  const mes = mesDe(quando);
  const uso = (await usoPorMes(ctx.conta.id, perfilId, [mes], idPublicacao))[mes];
  if (uso[cat] >= (limites[cat] ?? 0)) {
    throw new ErroHttp(
      403,
      `Seu plano publica sozinho até ${limites[cat]} ${NOME[cat]} por mês em cada perfil, e ${nomeDoMes(mes)} já está completo. ` +
        `Você pode postar este manualmente, escolher outro mês ou mudar de plano para publicar sem limite.`,
      "cota",
    );
  }
}

/** Quantos perfis da conta já publicam pela plataforma (Metricool da plataforma ou Instagram direto). */
export async function perfisComPublicacao(contaId: string, exceto?: string): Promise<number> {
  const [r] = await sql()`select count(distinct perfil_id)::int as n from (
      select perfil_id from metricool_marcas where conta_id = ${contaId}::uuid and origem = 'plataforma'
      union select perfil_id from conexoes_instagram where conta_id = ${contaId}::uuid
    ) x where perfil_id <> ${exceto ?? ""}`;
  return r.n;
}
