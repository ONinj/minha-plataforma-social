"use client";

import { api, enviarArquivo, MODO_NUVEM } from "./nuvem";
import { extrairQuadros, urlNoFal } from "./biblioteca";
import { chamarClaude } from "./servicos";
import { textoDoPerfil } from "./perfil";
import type { useStore } from "./store";
import type { Midia } from "./tipos";
import { blobParaBase64, reduzirImagem } from "./util";

type Store = ReturnType<typeof useStore>;

export type Palavra = { inicio: number; fim: number; texto: string };
export type Formato = "9:16" | "1:1" | "4:5" | "original";
export type PlanoEdicao = {
  titulo: string;
  resumo: string;
  encaixe: string;
  formato: Formato;
  cortes: { inicio: number; fim: number }[];
  legendas: { ativo: boolean; posicao: "baixo" | "meio" | "topo"; cor: string; destaque: string; tamanho: "p" | "m" | "g"; maiusculas: boolean };
  textos: { texto: string; inicio: number; fim: number; posicao: "topo" | "meio" | "baixo" }[];
  logo: { ativo: boolean; posicao: "topo-direita" | "topo-esquerda" | "baixo-direita" | "baixo-esquerda" };
  post: { tipo: "reels" | "story"; legenda: string; hashtags: string; data: string | null };
};

// ---------------- 1. Transcrição com o tempo de cada palavra ----------------

/** Transcreve o vídeo. Devolve as palavras com tempo (vazio se não houver fala ou se a transcrição falhar). */
export async function transcrever(store: Store, midia: Midia, blob: Blob): Promise<{ texto: string; palavras: Palavra[] }> {
  let r: { texto: string; trechos: Palavra[] };
  if (MODO_NUVEM) {
    const caminho = await enviarArquivo(midia.id, blob);
    r = await api("/api/transcrever", { corpo: { caminho } });
  } else {
    const url = await urlNoFal(store, midia, blob);
    const resp = await fetch("/api/transcrever", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-fal-key": store.obter().config.chaveFal },
      body: JSON.stringify({ url }),
    });
    r = await resp.json();
    if (!resp.ok) throw new Error((r as unknown as { error?: string }).error ?? "Falha na transcrição.");
  }
  return { texto: r.texto, palavras: emPalavras(r.trechos ?? []) };
}

/** Se vierem frases em vez de palavras, divide o tempo de cada frase entre as palavras dela. */
function emPalavras(trechos: Palavra[]): Palavra[] {
  const saida: Palavra[] = [];
  for (const t of trechos) {
    const partes = t.texto.split(/\s+/).filter(Boolean);
    if (partes.length <= 1) {
      saida.push(t);
      continue;
    }
    const passo = Math.max(0.05, (t.fim - t.inicio) / partes.length);
    partes.forEach((p, i) => saida.push({ texto: p, inicio: t.inicio + i * passo, fim: t.inicio + (i + 1) * passo }));
  }
  return saida;
}

/** Junta as palavras em frases com tempo (para o Claude ler sem gastar muito). */
export function frases(palavras: Palavra[]): Palavra[] {
  const r: Palavra[] = [];
  let atual: Palavra | null = null;
  let n = 0;
  for (const p of palavras) {
    if (atual && (p.inicio - atual.fim > 0.6 || n >= 12)) {
      r.push(atual);
      atual = null;
    }
    if (!atual) {
      atual = { ...p };
      n = 1;
    } else {
      atual.texto += ` ${p.texto}`;
      atual.fim = p.fim;
      n++;
    }
  }
  if (atual) r.push(atual);
  return r;
}

// ---------------- 2. Plano de edição feito pelo Claude ----------------

const SISTEMA_EDITOR = `Você é o editor de vídeo de uma plataforma de social media. Recebe um vídeo bruto gravado pelo usuário (como algumas imagens tiradas do vídeo, em ordem, e a transcrição com o tempo de cada frase), o guia da marca, o calendário do perfil e o pedido do usuário. Você não assiste ao vídeo inteiro: decida pelos quadros e pela transcrição.

Monte um plano de edição para Instagram e responda SOMENTE com um JSON válido, sem texto antes ou depois:
{"titulo": "...", "resumo": "...", "encaixe": "...", "formato": "9:16", "cortes": [{"inicio": 0.0, "fim": 0.0}],
 "legendas": {"ativo": true, "posicao": "baixo", "cor": "#FFFFFF", "destaque": "#FFD400", "tamanho": "m", "maiusculas": false},
 "textos": [{"texto": "...", "inicio": 0.0, "fim": 0.0, "posicao": "topo"}],
 "logo": {"ativo": false, "posicao": "topo-direita"},
 "post": {"tipo": "reels", "legenda": "...", "hashtags": "...", "data": "YYYY-MM-DDTHH:mm"}}

Regras:
- "cortes": os trechos do vídeo ORIGINAL que ficam, em ordem, em segundos. Tire silêncios longos (mais de 0,7 s), gaguejadas, frases repetidas, "ééé", começos falsos e o que não interessa. Não corte uma palavra no meio: use os tempos da transcrição. Sem fala, corte pelo que os quadros mostram.
- Os 2 primeiros segundos precisam prender: comece pela frase mais forte, se fizer sentido.
- Respeite a duração pedida; sem pedido, reels de 15 a 45 s e story de até 15 s.
- "textos": no máximo 3, curtos (até 6 palavras), com tempo no vídeo FINAL (já cortado). Use para o gancho e a chamada para ação.
- Cores das legendas e dos textos: as da marca, se o guia tiver; senão branco com destaque amarelo.
- "logo": ative só se o perfil tiver logo (o pedido diz) e combinar com o vídeo.
- "formato": 9:16 para reels/stories, salvo pedido diferente.
- "encaixe": em uma ou duas frases, onde este vídeo entra no planejamento/calendário do perfil (data ou lacuna sugerida e por quê).
- "post": legenda pronta no tom da marca, hashtags e a data sugerida (ou null).
- "resumo": em 2 ou 3 frases simples, o que você cortou e fez, para o usuário entender.`;

/** Pede ao Claude o plano de edição. */
export async function planejarEdicao(
  store: Store,
  midia: Midia,
  blob: Blob,
  palavras: Palavra[],
  pedido: string,
  temLogo: boolean,
): Promise<PlanoEdicao> {
  const { duracao, quadros } = await extrairQuadros(blob);
  const dur = duracao ?? 0;
  const imagens = await Promise.all(
    quadros.slice(0, 8).map(async (q) => {
      const r = await reduzirImagem(q, 640);
      return { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: await blobParaBase64(r) } };
    }),
  );
  const { agendamentos } = store.obter();
  const hoje = new Date().toISOString().slice(0, 10);
  const calendario = agendamentos
    .filter((a) => a.status !== "cancelado" && a.data.slice(0, 10) >= hoje)
    .slice(0, 30)
    .map((a) => `- ${a.data.replace("T", " ")} · ${a.tipo} · ${a.titulo} (${a.status})`)
    .join("\n");
  const transcricao = frases(palavras)
    .map((f) => `[${f.inicio.toFixed(1)}–${f.fim.toFixed(1)}] ${f.texto}`)
    .join("\n");
  const texto = `${textoDoPerfil(store)}

Hoje: ${hoje}. Duração do vídeo: ${dur.toFixed(1)} s. ${quadros.length} quadros acima, em ordem, espalhados pelo vídeo. Perfil ${temLogo ? "TEM" : "não tem"} logo salvo.

Calendário do perfil (próximos):
${calendario || "(vazio)"}

Transcrição (segundos):
${transcricao || "(sem fala detectada)"}

Pedido do usuário: ${pedido.trim() || "Faça a melhor edição para um reels deste perfil."}`;
  const resposta = await chamarClaude(store, {
    system: SISTEMA_EDITOR,
    uso: "Editor de vídeo",
    messages: [{ role: "user", content: [...imagens, { type: "text", text: texto }] }],
  });
  const bruto = resposta.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const json = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as Partial<PlanoEdicao>;
  return normalizarPlano(json, dur);
}

/** Garante que o plano faz sentido (tempos dentro do vídeo, sem sobreposição, valores conhecidos). */
export function normalizarPlano(p: Partial<PlanoEdicao>, duracao: number): PlanoEdicao {
  const max = duracao > 0 ? duracao : 3600;
  let cortes = (p.cortes ?? [])
    .map((c) => ({ inicio: Math.max(0, Number(c.inicio) || 0), fim: Math.min(max, Number(c.fim) || 0) }))
    .filter((c) => c.fim - c.inicio >= 0.3)
    .sort((a, b) => a.inicio - b.inicio);
  const juntos: { inicio: number; fim: number }[] = [];
  for (const c of cortes) {
    const ult = juntos[juntos.length - 1];
    if (ult && c.inicio <= ult.fim + 0.05) ult.fim = Math.max(ult.fim, c.fim);
    else juntos.push({ ...c });
  }
  cortes = juntos.length ? juntos : [{ inicio: 0, fim: max }];
  const formatos: Formato[] = ["9:16", "1:1", "4:5", "original"];
  const cor = (c: unknown, padrao: string) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : padrao);
  const l = p.legendas ?? ({} as PlanoEdicao["legendas"]);
  return {
    titulo: String(p.titulo ?? "Vídeo editado").slice(0, 80),
    resumo: String(p.resumo ?? ""),
    encaixe: String(p.encaixe ?? ""),
    formato: formatos.includes(p.formato as Formato) ? (p.formato as Formato) : "9:16",
    cortes,
    legendas: {
      ativo: l.ativo !== false,
      posicao: ["baixo", "meio", "topo"].includes(l.posicao) ? l.posicao : "baixo",
      cor: cor(l.cor, "#FFFFFF"),
      destaque: cor(l.destaque, "#FFD400"),
      tamanho: ["p", "m", "g"].includes(l.tamanho) ? l.tamanho : "m",
      maiusculas: !!l.maiusculas,
    },
    textos: (p.textos ?? [])
      .slice(0, 5)
      .map((t) => ({ texto: String(t.texto ?? "").slice(0, 60), inicio: Math.max(0, Number(t.inicio) || 0), fim: Math.max(0, Number(t.fim) || 0), posicao: (["topo", "meio", "baixo"].includes(t.posicao) ? t.posicao : "topo") as "topo" }))
      .filter((t) => t.texto && t.fim > t.inicio),
    logo: { ativo: !!p.logo?.ativo, posicao: (["topo-direita", "topo-esquerda", "baixo-direita", "baixo-esquerda"].includes(p.logo?.posicao ?? "") ? p.logo!.posicao : "topo-direita") },
    post: {
      tipo: p.post?.tipo === "story" ? "story" : "reels",
      legenda: String(p.post?.legenda ?? ""),
      hashtags: String(p.post?.hashtags ?? ""),
      data: typeof p.post?.data === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(p.post.data) ? p.post.data.slice(0, 16) : null,
    },
  };
}

export function duracaoFinal(plano: PlanoEdicao) {
  return plano.cortes.reduce((s, c) => s + (c.fim - c.inicio), 0);
}

// ---------------- 3. Montagem no navegador ----------------

const TAMANHOS: Record<Formato, [number, number] | null> = { "9:16": [1080, 1920], "1:1": [1080, 1080], "4:5": [1080, 1350], original: null };

function tipoDeGravacao() {
  const opcoes = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return opcoes.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "video/webm";
}

/** Agrupa as palavras em blocos curtos de legenda (até 4 palavras ou 1,8 s). */
function blocosDeLegenda(palavras: Palavra[]) {
  const blocos: { inicio: number; fim: number; palavras: Palavra[] }[] = [];
  for (const p of palavras) {
    const b = blocos[blocos.length - 1];
    if (b && b.palavras.length < 4 && p.inicio - b.fim < 0.4 && p.fim - b.inicio < 1.8) {
      b.palavras.push(p);
      b.fim = p.fim;
    } else blocos.push({ inicio: p.inicio, fim: p.fim, palavras: [p] });
  }
  return blocos;
}

function esperar(v: HTMLVideoElement, evento: string) {
  return new Promise<void>((ok) => v.addEventListener(evento, () => ok(), { once: true }));
}

type Opcoes = { logo?: Blob | null; aoProgresso?: (p: number) => void };
type Bloco = { inicio: number; fim: number; palavras: Palavra[] };

/** Desenha legendas, textos e logo por cima do quadro já desenhado no canvas. */
function desenharSobreposicoes(
  g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  W: number,
  H: number,
  plano: PlanoEdicao,
  blocos: Bloco[],
  logo: ImageBitmap | null,
  tFonte: number,
  tFinal: number,
) {
  const L = plano.legendas;
  const fonte = Math.round(W * ({ p: 0.045, m: 0.058, g: 0.072 }[L.tamanho] ?? 0.058));
  if (L.ativo) {
    const b = blocos.find((x) => tFonte >= x.inicio - 0.05 && tFonte <= x.fim + 0.15);
    if (b) {
      g.font = `800 ${fonte}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
      g.textAlign = "left";
      g.textBaseline = "middle";
      const palavrasB = b.palavras.map((p) => ({ ...p, texto: L.maiusculas ? p.texto.toUpperCase() : p.texto }));
      const espaco = g.measureText(" ").width;
      const linhas: (typeof palavrasB)[] = [[]];
      let largura = 0;
      for (const p of palavrasB) {
        const w = g.measureText(p.texto).width;
        if (largura + w > W * 0.84 && linhas[linhas.length - 1].length) {
          linhas.push([]);
          largura = 0;
        }
        linhas[linhas.length - 1].push(p);
        largura += w + espaco;
      }
      const yBase = L.posicao === "topo" ? H * 0.16 : L.posicao === "meio" ? H * 0.5 : H * 0.78;
      linhas.forEach((linha, i) => {
        const wLinha = linha.reduce((s, p) => s + g.measureText(p.texto).width, 0) + espaco * (linha.length - 1);
        let x = (W - wLinha) / 2;
        const y = yBase + (i - (linhas.length - 1) / 2) * fonte * 1.25;
        for (const p of linha) {
          g.lineWidth = fonte * 0.16;
          g.strokeStyle = "rgba(0,0,0,.85)";
          g.lineJoin = "round";
          g.strokeText(p.texto, x, y);
          g.fillStyle = tFonte >= p.inicio && tFonte <= p.fim + 0.05 ? L.destaque : L.cor;
          g.fillText(p.texto, x, y);
          x += g.measureText(p.texto).width + espaco;
        }
      });
    }
  }
  for (const t of plano.textos) {
    if (tFinal < t.inicio || tFinal > t.fim) continue;
    const tam = Math.round(W * 0.055);
    g.font = `800 ${tam}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const w = Math.min(W * 0.9, g.measureText(t.texto).width + tam * 1.2);
    const y = t.posicao === "topo" ? H * 0.09 : t.posicao === "meio" ? H * 0.42 : H * 0.9;
    g.fillStyle = "rgba(0,0,0,.6)";
    g.beginPath();
    g.roundRect((W - w) / 2, y - tam * 0.85, w, tam * 1.7, tam * 0.5);
    g.fill();
    g.fillStyle = L.cor;
    g.fillText(t.texto, W / 2, y, W * 0.86);
  }
  if (logo) {
    const lw = W * 0.14, lh = (logo.height / logo.width) * lw, m = W * 0.04;
    const x = plano.logo.posicao.endsWith("direita") ? W - lw - m : m;
    const y = plano.logo.posicao.startsWith("topo") ? m : H - lh - m;
    g.globalAlpha = 0.92;
    g.drawImage(logo, x, y, lw, lh);
    g.globalAlpha = 1;
  }
}

class SemSuporte extends Error {}

/**
 * Monta o vídeo final quadro a quadro com WebCodecs (biblioteca Mediabunny): lê cada quadro exato dos trechos,
 * desenha legendas/textos/logo e codifica em MP4. Não depende de tocar o vídeo, então não perde quadros nem trava,
 * e não precisa da aba visível.
 */
async function montarQuadroAQuadro(blob: Blob, plano: PlanoEdicao, palavras: Palavra[], opcoes: Opcoes) {
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") throw new SemSuporte("sem WebCodecs");
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  const vtrack = await input.getPrimaryVideoTrack();
  if (!vtrack || !(await vtrack.canDecode())) throw new SemSuporte("não decodifica o vídeo");
  const atrack = await input.getPrimaryAudioTrack();
  const temAudio = !!atrack && (await atrack.canDecode());

  let [W, H] = TAMANHOS[plano.formato] ?? [vtrack.displayWidth, vtrack.displayHeight];
  if (!TAMANHOS[plano.formato]) {
    const escala = Math.min(1, 1920 / Math.max(W, H));
    W = Math.round((W * escala) / 2) * 2;
    H = Math.round((H * escala) / 2) * 2;
  }
  if (!(await mb.canEncodeVideo("avc", { width: W, height: H }))) throw new SemSuporte("não codifica H.264");
  const codecAudio = temAudio ? ((await mb.canEncodeAudio("aac")) ? "aac" : (await mb.canEncodeAudio("opus")) ? "opus" : null) : null;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  const logo = opcoes.logo && plano.logo.ativo ? await createImageBitmap(opcoes.logo) : null;
  const blocos = blocosDeLegenda(palavras);
  const fps = 30;
  const total = duracaoFinal(plano);

  const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() });
  const video = new mb.CanvasSource(canvas, { codec: "avc", bitrate: mb.QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: fps });
  const audio = codecAudio ? new mb.AudioBufferSource({ codec: codecAudio, bitrate: mb.QUALITY_HIGH }) : null;
  if (audio) output.addAudioTrack(audio);
  await output.start();

  // "cover": preenche o formato cortando as sobras; a rotação do celular já vem aplicada.
  const quadros = new mb.CanvasSink(vtrack, { width: W, height: H, fit: "cover" });
  const sons = temAudio && audio ? new mb.AudioBufferSink(atrack!) : null;
  let tSaida = 0;
  try {
    for (const c of plano.cortes) {
      const n = Math.max(1, Math.round((c.fim - c.inicio) * fps));
      const tempos = Array.from({ length: n }, (_, i) => c.inicio + i / fps);
      let i = 0;
      for await (const q of quadros.canvasesAtTimestamps(tempos)) {
        if (q) {
          g.drawImage(q.canvas, 0, 0, W, H);
        } else if (i === 0) {
          g.fillStyle = "#000";
          g.fillRect(0, 0, W, H);
        }
        desenharSobreposicoes(g, W, H, plano, blocos, logo, tempos[i], tSaida + i / fps);
        await video.add(tSaida + i / fps, 1 / fps);
        i++;
        if (i % 10 === 0) opcoes.aoProgresso?.(Math.min(0.99, (tSaida + i / fps) / Math.max(0.1, total)));
      }
      // Áudio do mesmo trecho (cortado na medida exata).
      if (sons && audio) {
        const fimTrecho = c.inicio + n / fps;
        for await (const s of sons.buffers(c.inicio, fimTrecho)) {
          const ini = Math.max(c.inicio, s.timestamp), fim = Math.min(fimTrecho, s.timestamp + s.duration);
          if (fim <= ini) continue;
          const taxa = s.buffer.sampleRate;
          const de = Math.round((ini - s.timestamp) * taxa), ate = Math.min(s.buffer.length, Math.round((fim - s.timestamp) * taxa));
          if (ate - de <= 0) continue;
          const pedaco = new AudioBuffer({ length: ate - de, numberOfChannels: s.buffer.numberOfChannels, sampleRate: taxa });
          for (let ch = 0; ch < s.buffer.numberOfChannels; ch++) pedaco.copyToChannel(s.buffer.getChannelData(ch).subarray(de, ate), ch);
          await audio.add(pedaco);
        }
      }
      tSaida += n / fps;
    }
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => {});
    throw e;
  } finally {
    logo?.close();
  }
  const buffer = (output.target as InstanceType<typeof mb.BufferTarget>).buffer!;
  opcoes.aoProgresso?.(1);
  return { blob: new Blob([buffer], { type: "video/mp4" }), mime: "video/mp4", duracao: tSaida };
}

/** Monta o vídeo final: quadro a quadro quando o navegador permite (o normal); senão, gravando a reprodução. */
export async function montarVideo(blob: Blob, plano: PlanoEdicao, palavras: Palavra[], opcoes: Opcoes = {}) {
  try {
    return await montarQuadroAQuadro(blob, plano, palavras, opcoes);
  } catch (e) {
    if (!(e instanceof SemSuporte)) console.warn("Montagem quadro a quadro falhou, usando a gravação:", e);
    return montarGravando(blob, plano, palavras, opcoes);
  }
}

/**
 * Plano B (navegadores sem WebCodecs): toca os trechos e grava o canvas junto com o áudio, em tempo real.
 * Cada quadro é desenhado quando o vídeo entrega um quadro novo, e a gravação só volta depois que o trecho começa a tocar.
 */
async function montarGravando(
  blob: Blob,
  plano: PlanoEdicao,
  palavras: Palavra[],
  opcoes: Opcoes = {},
): Promise<{ blob: Blob; mime: string; duracao: number }> {
  const url = URL.createObjectURL(blob);
  const v = document.createElement("video");
  v.src = url;
  v.playsInline = true;
  v.preload = "auto";
  // No documento (quase invisível) para o navegador não reduzir a decodificação de um vídeo "fora da página".
  Object.assign(v.style, { position: "fixed", left: "0", top: "0", width: "2px", height: "2px", opacity: "0.01", pointerEvents: "none" });
  document.body.appendChild(v);
  await esperar(v, "loadedmetadata");
  const [W, H] = TAMANHOS[plano.formato] ?? (() => {
    const escala = Math.min(1, 1920 / Math.max(v.videoWidth, v.videoHeight));
    return [Math.round((v.videoWidth * escala) / 2) * 2, Math.round((v.videoHeight * escala) / 2) * 2] as [number, number];
  })();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  const logo = opcoes.logo && plano.logo.ativo ? await createImageBitmap(opcoes.logo) : null;
  const audio = new AudioContext();
  await audio.resume().catch(() => {});
  const destino = audio.createMediaStreamDestination();
  audio.createMediaElementSource(v).connect(destino);
  const fluxo = canvas.captureStream(30);
  destino.stream.getAudioTracks().forEach((t) => fluxo.addTrack(t));
  const mime = tipoDeGravacao();
  const gravador = new MediaRecorder(fluxo, { mimeType: mime, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 });
  const partes: Blob[] = [];
  gravador.ondataavailable = (e) => e.data.size && partes.push(e.data);
  const fim = new Promise<void>((ok) => (gravador.onstop = () => ok()));
  const blocos = blocosDeLegenda(palavras);
  const total = duracaoFinal(plano);
  let acumulado = 0;
  let corte = plano.cortes[0];
  const desenhar = () => {
    const vw = v.videoWidth || W, vh = v.videoHeight || H;
    const escala = Math.max(W / vw, H / vh);
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    g.drawImage(v, (W - vw * escala) / 2, (H - vh * escala) / 2, vw * escala, vh * escala);
    const tFinal = acumulado + Math.max(0, v.currentTime - corte.inicio);
    desenharSobreposicoes(g, W, H, plano, blocos, logo, v.currentTime, tFinal);
    opcoes.aoProgresso?.(Math.min(0.99, tFinal / Math.max(0.1, total)));
  };
  const proximoQuadro = (cb: () => void) =>
    "requestVideoFrameCallback" in v
      ? (v as HTMLVideoElement & { requestVideoFrameCallback: (f: () => void) => number }).requestVideoFrameCallback(cb)
      : requestAnimationFrame(cb);
  try {
    gravador.start(250);
    gravador.pause();
    for (const c of plano.cortes) {
      corte = c;
      v.currentTime = c.inicio;
      await esperar(v, "seeked");
      desenhar();
      // Só volta a gravar quando o trecho já está tocando (evita a imagem parada no começo de cada corte).
      const tocando = esperar(v, "playing");
      await v.play();
      await tocando;
      gravador.resume();
      await new Promise<void>((ok) => {
        const passo = () => {
          desenhar();
          if (v.currentTime >= c.fim || v.ended) {
            v.pause();
            ok();
          } else proximoQuadro(passo);
        };
        proximoQuadro(passo);
      });
      gravador.pause();
      acumulado += c.fim - c.inicio;
    }
    gravador.stop();
    await fim;
  } finally {
    v.pause();
    v.remove();
    URL.revokeObjectURL(url);
    logo?.close();
    audio.close().catch(() => {});
  }
  opcoes.aoProgresso?.(1);
  return { blob: new Blob(partes, { type: mime.split(";")[0] }), mime: mime.split(";")[0], duracao: total };
}
