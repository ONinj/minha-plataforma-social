"use client";

import { createFalClient } from "@fal-ai/client";
import type { useStore } from "./store";
import type { Midia } from "./tipos";
import { agoraISO, novoId } from "./util";

type Store = ReturnType<typeof useStore>;

const QUADROS = 4;

/** Cliente do fal.ai no navegador (para enviar arquivos grandes direto, sem passar pelo servidor). */
export function falNoNavegador(chave: string) {
  return createFalClient({ credentials: chave, suppressLocalCredentialsWarning: true });
}

function carregarVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    v.onloadedmetadata = () => resolve(v);
    v.onerror = () => reject(new Error("O navegador não conseguiu abrir este vídeo."));
  });
}

function irPara(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const ok = () => {
      v.removeEventListener("seeked", ok);
      resolve();
    };
    v.addEventListener("seeked", ok);
    v.currentTime = t;
    setTimeout(ok, 4000);
  });
}

function capturar(v: HTMLVideoElement | ImageBitmap, ladoMax = 480): Promise<Blob> {
  const w = "videoWidth" in v ? v.videoWidth : v.width;
  const h = "videoHeight" in v ? v.videoHeight : v.height;
  const escala = Math.min(1, ladoMax / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * escala));
  c.height = Math.max(1, Math.round(h * escala));
  c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha no quadro"))), "image/jpeg", 0.75));
}

/** Extrai miniaturas espalhadas pelo vídeo (é assim que o Claude "vê" um vídeo). */
export async function extrairQuadros(blob: Blob): Promise<{ duracao?: number; quadros: Blob[] }> {
  if (blob.type.startsWith("image")) {
    const bmp = await createImageBitmap(blob);
    const q = await capturar(bmp);
    bmp.close();
    return { quadros: [q] };
  }
  const url = URL.createObjectURL(blob);
  try {
    const v = await carregarVideo(url);
    const duracao = isFinite(v.duration) ? v.duration : undefined;
    const quadros: Blob[] = [];
    for (let i = 0; i < QUADROS; i++) {
      const t = duracao ? (duracao * (i + 0.5)) / QUADROS : i;
      await irPara(v, t);
      if (v.videoWidth) quadros.push(await capturar(v));
    }
    return { duracao, quadros };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Corta um trecho do vídeo gravando a reprodução (o Seedance aceita referências de até ~30 s). */
export async function recortarVideo(blob: Blob, inicio: number, segundos: number): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const v = await carregarVideo(url);
    v.muted = true;
    await irPara(v, inicio);
    const fluxo = (v as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream();
    const tipo = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );
    const gravador = new MediaRecorder(fluxo, tipo ? { mimeType: tipo, videoBitsPerSecond: 6_000_000 } : undefined);
    const partes: Blob[] = [];
    gravador.ondataavailable = (e) => e.data.size && partes.push(e.data);
    const fim = new Promise<void>((r) => (gravador.onstop = () => r()));
    gravador.start(250);
    await v.play();
    await new Promise((r) => setTimeout(r, segundos * 1000));
    v.pause();
    gravador.stop();
    await fim;
    return new Blob(partes, { type: (tipo ?? "video/webm").split(";")[0] });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Adiciona arquivos à biblioteca do perfil, extraindo quadros e duração. */
export async function adicionarNaBiblioteca(
  store: Store,
  arquivos: { blob: Blob; nome: string; pasta: string; driveId?: string }[],
  aoProgresso?: (feitos: number, total: number) => void,
): Promise<Midia[]> {
  const novas: Midia[] = [];
  for (let i = 0; i < arquivos.length; i++) {
    const { blob, nome, pasta, driveId } = arquivos[i];
    const tipo = blob.type.startsWith("video") ? "video" : blob.type.startsWith("image") ? "imagem" : null;
    if (!tipo) continue;
    const midia: Midia = {
      id: novoId(tipo === "video" ? "vid" : "img"),
      tipo,
      titulo: nome.replace(/\.[^.]+$/, ""),
      origem: "upload",
      status: "pronto",
      mime: blob.type,
      criadoEm: agoraISO(),
      naBiblioteca: true,
      pasta: pasta || "Geral",
      driveId,
    };
    await store.salvarBlob(midia.id, blob);
    try {
      const { duracao, quadros } = await extrairQuadros(blob);
      for (let q = 0; q < quadros.length; q++) await store.salvarBlob(`${midia.id}_q${q}`, quadros[q]);
      midia.quadros = quadros.length;
      midia.duracao = duracao;
    } catch {
      /* sem quadros: o Claude vê só o nome e a descrição */
    }
    store.atualizar((e) => ({ ...e, midias: [midia, ...e.midias] }));
    novas.push(midia);
    aoProgresso?.(i + 1, arquivos.length);
  }
  return novas;
}

/** Envia um arquivo da biblioteca ao fal.ai (reaproveita o envio por até 5 dias). */
export async function urlNoFal(store: Store, midia: Midia, blob?: Blob): Promise<string> {
  const recente = midia.falUrl && midia.falUrlEm && Date.now() - Date.parse(midia.falUrlEm) < 5 * 864e5;
  if (recente && !blob) return midia.falUrl!;
  const arquivo = blob ?? (await store.lerBlob(midia.id));
  if (!arquivo) throw new Error(`Arquivo ${midia.titulo} não encontrado.`);
  const url = await falNoNavegador(store.obter().config.chaveFal).storage.upload(arquivo);
  if (!blob) store.atualizarMidia(midia.id, { falUrl: url, falUrlEm: agoraISO() });
  return url;
}

// ---------------- Google Drive ----------------

export type ArquivoDrive = { id: string; nome: string; mime: string; tamanho: number; pasta: string; duracao?: number };

export function idDoLinkDrive(link: string): { id: string; tipo: "pasta" | "arquivo" } | null {
  const pasta = link.match(/folders\/([\w-]+)/);
  if (pasta) return { id: pasta[1], tipo: "pasta" };
  const arquivo = link.match(/\/d\/([\w-]+)/) ?? link.match(/[?&]id=([\w-]+)/);
  if (arquivo) return { id: arquivo[1], tipo: "arquivo" };
  if (/^[\w-]{20,}$/.test(link.trim())) return { id: link.trim(), tipo: "pasta" };
  return null;
}

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const CAMPOS = "id,name,mimeType,size,videoMediaMetadata(durationMillis)";

async function driveJSON(url: string) {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message ?? `Erro ${r.status}`;
    throw new Error(
      r.status === 404
        ? "Pasta ou arquivo não encontrado. Confira se o link está compartilhado como 'Qualquer pessoa com o link'."
        : `Google Drive: ${msg}`,
    );
  }
  return j;
}

/** Lista vídeos e imagens de uma pasta pública do Drive (incluindo subpastas). */
export async function listarDrive(link: string, chave: string): Promise<ArquivoDrive[]> {
  const alvo = idDoLinkDrive(link);
  if (!alvo) throw new Error("Não reconheci esse link do Google Drive.");
  if (alvo.tipo === "arquivo") {
    const f = await driveJSON(`${DRIVE}/${alvo.id}?fields=${CAMPOS}&key=${chave}`);
    return [{ id: f.id, nome: f.name, mime: f.mimeType, tamanho: Number(f.size ?? 0), pasta: "Google Drive", duracao: f.videoMediaMetadata?.durationMillis / 1000 || undefined }];
  }
  const raiz = await driveJSON(`${DRIVE}/${alvo.id}?fields=name&key=${chave}`);
  const saida: ArquivoDrive[] = [];
  const fila: { id: string; caminho: string }[] = [{ id: alvo.id, caminho: raiz.name ?? "Google Drive" }];
  while (fila.length && saida.length < 2000) {
    const { id, caminho } = fila.shift()!;
    let token = "";
    do {
      const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
      const j = await driveJSON(
        `${DRIVE}?q=${q}&fields=nextPageToken,files(${CAMPOS})&pageSize=1000&key=${chave}${token ? `&pageToken=${token}` : ""}`,
      );
      for (const f of j.files ?? []) {
        if (f.mimeType === "application/vnd.google-apps.folder") fila.push({ id: f.id, caminho: `${caminho}/${f.name}` });
        else if (/^(video|image)\//.test(f.mimeType))
          saida.push({ id: f.id, nome: f.name, mime: f.mimeType, tamanho: Number(f.size ?? 0), pasta: caminho, duracao: f.videoMediaMetadata?.durationMillis / 1000 || undefined });
      }
      token = j.nextPageToken ?? "";
    } while (token);
  }
  return saida;
}

export async function baixarDoDrive(arquivo: ArquivoDrive, chave: string): Promise<Blob> {
  const r = await fetch(`${DRIVE}/${arquivo.id}?alt=media&key=${chave}`);
  if (!r.ok) throw new Error(`Não consegui baixar "${arquivo.nome}" do Drive (${r.status}).`);
  const blob = await r.blob();
  return blob.type ? blob : new Blob([blob], { type: arquivo.mime });
}
