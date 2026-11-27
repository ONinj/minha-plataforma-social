import type { InfoNuvem } from "./sincronia";

/** Funções dos planos usadas na tela de planos e na página de vendas. */
type Recursos = InfoNuvem["recursos"];
type Precos = Pick<InfoNuvem, "precos" | "cambio">;

const ESFORCO: Record<string, string> = { low: "Baixo", medium: "Médio", high: "Alto", xhigh: "Muito alto", max: "Máximo" };

/** Quanto dá para produzir com os créditos (pelos preços atuais das IAs). */
export function estimativa(n: Precos, creditos: number) {
  const margem = Number((n.precos as { margem_seguranca?: number }).margem_seguranca ?? 1);
  const emCreditos = (usd: number) => (usd * n.cambio * margem) / 0.1;
  const imagem = emCreditos(n.precos.imagem["fal-ai/nano-banana-2"] ?? 0.08);
  const video = emCreditos((n.precos.veo_por_segundo["fal-ai/veo3.1/lite"] ?? 0.06) * n.precos.segundos_veo);
  return `≈ ${Math.floor(creditos / imagem)} imagens ou ${Math.floor(creditos / video)} vídeos de ${n.precos.segundos_veo}s por mês`;
}

/** Lista de benefícios gerada a partir do que o plano libera de verdade. */
export function beneficios(r: Recursos): { texto: string; tem: boolean }[] {
  const res = r.seedance_resolucoes;
  const pct = (v?: number) => `${Math.round((v ?? 0) * 100)}%`;
  return [
    { texto: `${r.max_perfis} perfi${r.max_perfis > 1 ? "s" : "l"} de clientes`, tem: true },
    { texto: r.claude.includes("claude-opus-5-5") ? "Gerente com Claude Opus e Sonnet" : "Gerente com Claude Sonnet", tem: true },
    { texto: `Capricho do gerente: até ${ESFORCO[r.esforco_max] ?? r.esforco_max}`, tem: true },
    { texto: r.imagem.includes("fal-ai/nano-banana-pro") ? "Imagens Nano Banana 2 e Pro" : "Imagens Nano Banana 2", tem: true },
    {
      texto: r.veo.includes("fal-ai/veo3.1") ? "Veo 3.1 Lite, Fast e completo" : r.veo.includes("fal-ai/veo3.1/fast") ? "Veo 3.1 Lite e Fast" : "Veo 3.1 Lite",
      tem: true,
    },
    { texto: r.seedance ? `Seedance até ${res?.length ? res[res.length - 1] : "1080p"}` : "Seedance", tem: !!r.seedance },
    { texto: "Biblioteca de referências", tem: !!r.biblioteca },
    { texto: "Importar do Google Drive", tem: !!r.drive },
    {
      texto: !r.instagram
        ? "Publicação automática no Instagram"
        : r.publicacao_mensal
          ? `Publicação automática: ${r.publicacao_mensal.reels} reels, ${r.publicacao_mensal.stories} stories e ${r.publicacao_mensal.posts} posts por mês${r.perfis_publicacao ? ` (${r.perfis_publicacao} perfi${r.perfis_publicacao > 1 ? "s" : "l"})` : ""}`
          : `Publicação automática sem limite${r.perfis_publicacao ? ` (até ${r.perfis_publicacao} perfis)` : ""}`,
      tem: !!r.instagram,
    },
    { texto: r.acumulo ? `Sobra de créditos acumula até ${pct(r.acumulo)} do plano` : "Créditos acumulam para o mês seguinte", tem: !!r.acumulo },
    { texto: r.desconto_recarga ? `${pct(r.desconto_recarga)} de desconto nas recargas` : "Desconto nas recargas", tem: !!r.desconto_recarga },
    ...(r.extras ?? []).map((t) => ({ texto: t, tem: true })),
  ];
}
