"use client";

import type Anthropic from "@anthropic-ai/sdk";
import type { useStore } from "./store";
import { PRECOS_CLAUDE, type Configuracoes, type MensagemClaude, type Midia } from "./tipos";
import { recortarVideo, urlNoFal } from "./biblioteca";
import { MODO_NUVEM, cabecalhosNuvem, enviarArquivo, observarResposta } from "./nuvem";
import { agoraISO, base64ParaBlob, blobParaBase64, novoId, reduzirImagem } from "./util";

type Store = ReturnType<typeof useStore>;

type Cabecalhos = Record<string, string> | Promise<Record<string, string>>;

async function postJSON<T>(url: string, corpo: unknown, headers: Cabecalhos): Promise<T> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await headers) },
    body: JSON.stringify(corpo),
  });
  const j = await resp.json().catch(() => ({}));
  if (MODO_NUVEM) observarResposta(resp, j);
  if (!resp.ok) throw new Error(j.error ?? `Erro ${resp.status}`);
  return j as T;
}

async function getJSON<T>(url: string, headers: Cabecalhos): Promise<T> {
  const resp = await fetch(url, { headers: await headers });
  const j = await resp.json().catch(() => ({}));
  if (MODO_NUVEM) observarResposta(resp, j);
  if (!resp.ok) throw new Error(j.error ?? `Erro ${resp.status}`);
  return j as T;
}

/** No modo nuvem vai o login (as chaves ficam no servidor); no modo local, as chaves do navegador. */
const hAnthropic = (c: Configuracoes): Cabecalhos => (MODO_NUVEM ? cabecalhosNuvem() : { "x-anthropic-key": c.chaveAnthropic });
const hFal = (c: Configuracoes): Cabecalhos => (MODO_NUVEM ? cabecalhosNuvem() : { "x-fal-key": c.chaveFal });

// ---------------- Claude ----------------

export async function chamarClaude(
  store: Store,
  params: {
    system?: string;
    messages: MensagemClaude[];
    tools?: Anthropic.Beta.BetaTool[];
    effort?: Configuracoes["esforcoGerente"];
    /** Usa outro modelo nesta chamada (ex.: Haiku para tarefas simples e baratas). */
    modelo?: string;
    /** Como aparece no extrato de créditos (ex.: "Gerente"). */
    uso?: string;
  },
): Promise<Anthropic.Beta.BetaMessage> {
  const config = store.obter().config;
  if (!MODO_NUVEM && !config.chaveAnthropic) throw new Error("Cadastre a chave da Anthropic em Configurações.");
  const resposta = await postJSON<Anthropic.Beta.BetaMessage>(
    "/api/claude",
    { model: params.modelo ?? config.modeloClaude, system: params.system, messages: params.messages, tools: params.tools, effort: params.effort, uso: params.uso },
    hAnthropic(config),
  );
  store.registrarGasto("claude", custoClaude(resposta));
  return resposta;
}

function custoClaude(r: Anthropic.Beta.BetaMessage): number {
  const [entrada, saida] = PRECOS_CLAUDE[r.model] ?? PRECOS_CLAUDE["claude-opus-5-5"];
  const u = r.usage;
  const tokensEntrada =
    (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1;
  return (tokensEntrada * entrada + (u.output_tokens ?? 0) * saida) / 1_000_000;
}

// ---------------- Imagens (Nano Banana pelo fal.ai) ----------------

type ParteAPI = { text?: string; inlineData?: { mimeType: string; data: string } };

/** Lê uma imagem salva, reduzida, em base64 (para mandar às IAs). */
export async function midiaParaInline(store: Store, id: string, ladoMax = 1536) {
  const blob = await store.lerBlob(id);
  if (!blob) throw new Error(`Mídia ${id} não encontrada.`);
  const reduzida = await reduzirImagem(blob, ladoMax);
  return { inlineData: { mimeType: "image/jpeg", data: await blobParaBase64(reduzida) } };
}

/** Salva as imagens geradas na biblioteca e devolve as mídias criadas. */
export async function salvarImagensGemini(
  store: Store,
  partes: ParteAPI[],
  info: { titulo: string; prompt: string },
): Promise<Midia[]> {
  const criadas: Midia[] = [];
  for (const p of partes) {
    if (!p.inlineData) continue;
    const midia: Midia = {
      id: novoId("img"),
      tipo: "imagem",
      titulo: info.titulo,
      prompt: info.prompt,
      origem: "gemini",
      status: "pronto",
      mime: p.inlineData.mimeType,
      criadoEm: agoraISO(),
    };
    await store.salvarBlob(midia.id, base64ParaBlob(p.inlineData.data, p.inlineData.mimeType));
    store.atualizar((e) => ({ ...e, midias: [midia, ...e.midias] }));
    criadas.push(midia);
  }
  if (criadas.length) store.registrarGasto("gemini", store.obter().config.precoImagem * criadas.length);
  return criadas;
}

/** Gera uma imagem no fal.ai (Nano Banana 2) e salva na biblioteca. */
export async function gerarImagemFal(
  store: Store,
  params: { prompt: string; proporcao?: string; referencias?: string[]; titulo: string },
): Promise<{ midias: Midia[]; texto: string }> {
  const config = store.obter().config;
  if (!MODO_NUVEM && !config.chaveFal) throw new Error("Cadastre a chave do fal.ai em Configurações.");
  const referencias = [];
  for (const id of params.referencias ?? []) {
    const inline = await midiaParaInline(store, id, 1536);
    referencias.push({ mimeType: inline.inlineData.mimeType, base64: inline.inlineData.data });
  }
  const r = await postJSON<{ imagens: { mimeType: string; base64: string }[]; texto: string }>(
    "/api/fal/imagem",
    { modelo: config.modeloImagemFal, prompt: params.prompt, proporcao: params.proporcao, referencias },
    hFal(config),
  );
  const midias = await salvarImagensGemini(
    store,
    r.imagens.map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.base64 } })),
    { titulo: params.titulo, prompt: params.prompt },
  );
  if (!midias.length) throw new Error(r.texto || "O fal.ai não devolveu nenhuma imagem.");
  return { midias, texto: r.texto };
}

export const gerarImagem = gerarImagemFal;

// ---------------- Vídeo (Veo e Seedance) ----------------

export function custoEstimadoVideo(config: Configuracoes, provedor: "veo" | "seedance"): number {
  return provedor === "veo"
    ? config.precoVeoSegundo * config.segundosVeo
    : config.precoSeedanceSegundo * config.segundosSeedance;
}

export async function iniciarVideo(
  store: Store,
  params: {
    provedor: "veo" | "seedance";
    prompt: string;
    titulo: string;
    imagemId?: string;
    proporcao?: string;
    duracao?: string;
    pedidoPor?: Midia["pedidoPor"];
    /** Vídeo da biblioteca para o Seedance usar como referência. */
    videoReferenciaId?: string;
    trechoInicio?: number;
    aoEtapa?: (texto: string) => void;
  },
): Promise<Midia> {
  const config = store.obter().config;
  let videoReferenciaUrl: string | undefined;
  let videoReferenciaCaminho: string | undefined;
  let segundosReferencia: number | undefined;
  if (params.videoReferenciaId) {
    if (params.provedor !== "seedance") throw new Error("Só o Seedance aceita vídeo de referência. Use provedor 'seedance'.");
    const ref = store.obter().midias.find((m) => m.id === params.videoReferenciaId);
    if (!ref || ref.tipo !== "video") throw new Error("Vídeo de referência não encontrado na biblioteca.");
    if (!MODO_NUVEM && !config.chaveFal) throw new Error("Cadastre a chave do fal.ai em Configurações.");
    const longo = (ref.duracao ?? 0) > 30;
    if (longo || (params.trechoInicio ?? 0) > 0) {
      const inicio = Math.max(0, Math.min(params.trechoInicio ?? 0, (ref.duracao ?? 15) - 3));
      const segundos = Math.min(15, (ref.duracao ?? 15) - inicio);
      params.aoEtapa?.(`Recortando ${Math.round(segundos)}s de "${ref.titulo}" a partir de ${Math.round(inicio)}s...`);
      const blob = await store.lerBlob(ref.id);
      if (!blob) throw new Error("Arquivo do vídeo de referência não encontrado.");
      const trecho = await recortarVideo(blob, inicio, segundos);
      params.aoEtapa?.("Enviando o trecho para o Seedance...");
      segundosReferencia = segundos;
      if (MODO_NUVEM) videoReferenciaCaminho = await enviarArquivo(`trecho_${ref.id}_${Date.now()}`, trecho);
      else videoReferenciaUrl = await urlNoFal(store, ref, trecho);
    } else {
      params.aoEtapa?.(`Enviando "${ref.titulo}" para o Seedance...`);
      segundosReferencia = ref.duracao;
      if (MODO_NUVEM) {
        const blob = await store.lerBlob(ref.id);
        if (!blob) throw new Error("Arquivo do vídeo de referência não encontrado.");
        videoReferenciaCaminho = await enviarArquivo(ref.id, blob);
      } else videoReferenciaUrl = await urlNoFal(store, ref);
    }
  }
  let imagem: { mimeType: string; base64: string } | undefined;
  if (params.imagemId) {
    const inline = await midiaParaInline(store, params.imagemId, 1920);
    imagem = { mimeType: inline.inlineData.mimeType, base64: inline.inlineData.data };
  }

  let job: Midia["job"];
  if (!MODO_NUVEM && !config.chaveFal) throw new Error("Cadastre a chave do fal.ai em Configurações.");
  if (params.provedor === "veo") {
    const r = await postJSON<{ endpoint: string; requestId: string }>(
      "/api/fal/video-start",
      { familia: "veo", modelo: config.modeloVeoFal, prompt: params.prompt, titulo: params.titulo, imagem, proporcao: params.proporcao },
      hFal(config),
    );
    job = { provedor: "fal", endpoint: r.endpoint, requestId: r.requestId };
  } else {
    const r = await postJSON<{ endpoint: string; requestId: string }>(
      "/api/fal/video-start",
      {
        familia: "seedance",
        modelo: config.prefixoSeedance,
        titulo: params.titulo,
        videoReferenciaUrl,
        videoReferenciaCaminho,
        segundosReferencia,
        prompt: params.prompt,
        imagem,
        resolucao: config.resolucaoSeedance,
        duracao: params.duracao,
        proporcao: params.proporcao,
      },
      hFal(config),
    );
    job = { provedor: "seedance", endpoint: r.endpoint, requestId: r.requestId };
  }

  store.registrarGasto(params.provedor, custoEstimadoVideo(config, params.provedor));
  const midia: Midia = {
    id: novoId("vid"),
    tipo: "video",
    titulo: params.titulo,
    prompt: params.prompt,
    origem: params.provedor,
    status: "gerando",
    criadoEm: agoraISO(),
    iniciadoEm: agoraISO(),
    fase: "fila",
    pedidoPor: params.pedidoPor ?? "voce",
    imagemInicial: params.imagemId ?? (params.videoReferenciaId ? `${params.videoReferenciaId}_q0` : undefined),
    job,
  };
  store.atualizar((e) => ({ ...e, midias: [midia, ...e.midias] }));
  return midia;
}

/** Consulta os vídeos em produção (de todos os perfis da conta) e baixa os que ficaram prontos. */
export async function verificarVideos(store: Store) {
  const { config } = store.obter();
  for (const m of store.midiasGerando()) {
    if (!m.job) continue;
    try {
      if (m.job.provedor === "veo") {
        // Vídeo antigo, do Google direto (não usado mais).
        store.atualizarMidia(m.id, { status: "erro", erro: "Vídeo do Google direto, que não é mais usado." });
        continue;
      }
      const q = new URLSearchParams({ endpoint: m.job.endpoint, requestId: m.job.requestId });
      const r = await getJSON<{
        pronto: boolean;
        url?: string;
        erro?: string;
        fase?: Midia["fase"];
        posicao?: number;
        detalhe?: string;
      }>(`/api/fal/video-status?${q}`, hFal(config));
      if (!r.pronto) {
        if (r.fase && (r.fase !== m.fase || r.posicao !== m.posicaoFila || r.detalhe !== m.detalhe)) {
          store.atualizarMidia(m.id, { fase: r.fase, posicaoFila: r.posicao, detalhe: r.detalhe });
        }
        continue;
      }
      if (r.erro || !r.url) {
        store.atualizarMidia(m.id, { status: "erro", erro: r.erro, prontoEm: agoraISO() });
        store.avisar(`O vídeo "${m.titulo}" falhou.${MODO_NUVEM ? " Os créditos foram devolvidos." : ""}`, "erro");
        continue;
      }
      store.atualizarMidia(m.id, { fase: "baixando" });
      const prontoEm = agoraISO();
      try {
        const blob = await (await fetch(r.url)).blob();
        await store.salvarBlob(m.id, blob);
        store.atualizarMidia(m.id, { status: "pronto", prontoEm, mime: blob.type || "video/mp4", urlExterna: r.url });
      } catch {
        // Se o navegador não conseguir baixar, guarda o link do fal.ai.
        store.atualizarMidia(m.id, { status: "pronto", prontoEm, mime: "video/mp4", urlExterna: r.url });
      }
      store.avisar(`Vídeo pronto: "${m.titulo}"`, "ok");
    } catch (e) {
      console.warn("Falha ao verificar vídeo", m.id, e);
    }
  }
}
