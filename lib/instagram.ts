"use client";

import { useEffect, useState } from "react";
import { api, enviarArquivo } from "./nuvem";
import type { useStore } from "./store";
import type { Agendamento } from "./tipos";

type Store = ReturnType<typeof useStore>;

export type Conexao = { perfil_id: string; username: string; expira_em: string };

export async function listarConexoes(): Promise<Conexao[]> {
  return (await api<{ conexoes: Conexao[] }>("/api/instagram")).conexoes;
}

export async function conectarInstagram(perfilId: string) {
  const { url } = await api<{ url: string }>("/api/instagram/conectar", { corpo: { perfil: perfilId } });
  window.location.href = url;
}

export async function desconectarInstagram(perfilId: string) {
  await api(`/api/instagram?perfil=${encodeURIComponent(perfilId)}`, { metodo: "DELETE" });
}

/** O Instagram só aceita JPEG: converte a imagem (até 1440 px) mantendo a qualidade. */
async function paraJpeg(blob: Blob): Promise<Blob> {
  if (blob.type === "image/jpeg") return blob;
  const bmp = await createImageBitmap(blob);
  const escala = Math.min(1, 1440 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * escala);
  c.height = Math.round(bmp.height * escala);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error("Falha ao converter imagem"))), "image/jpeg", 0.92));
}

/** Define o formato no Instagram a partir do item do calendário e das mídias. */
function tipoInstagram(a: Agendamento, tipos: ("imagem" | "video")[]): "post" | "carrossel" | "reels" | "story" {
  if (a.tipo === "story") return "story";
  if (tipos.length > 1) return "carrossel";
  if (a.tipo === "reels" || tipos[0] === "video") return "reels";
  return "post";
}

/** Prepara as mídias (JPEG + armazenamento) e agenda a publicação automática. */
export async function agendarNoInstagram(store: Store, a: Agendamento, opcoes: { agora?: boolean } = {}) {
  const midias = a.midias.map((id) => store.obter().midias.find((m) => m.id === id)).filter(Boolean);
  if (!midias.length) throw new Error("Este item não tem imagem nem vídeo para publicar.");
  const enviadas: { caminho: string; tipo: "imagem" | "video" }[] = [];
  for (let i = 0; i < midias.length; i++) {
    const m = midias[i]!;
    const blob = await store.lerBlob(m.id);
    if (!blob) throw new Error(`Arquivo "${m.titulo}" não encontrado.`);
    if (m.tipo === "imagem") enviadas.push({ caminho: await enviarArquivo(`pub_${a.id}_${i}.jpg`, await paraJpeg(blob)), tipo: "imagem" });
    else enviadas.push({ caminho: await enviarArquivo(`pub_${a.id}_${i}.mp4`, blob), tipo: "video" });
  }
  const legenda = [a.legenda, a.hashtags].filter((t) => t?.trim()).join("\n\n");
  const r = await api<{ status: "agendada" | "publicando" | "publicada" }>("/api/publicacoes", {
    corpo: {
      id: a.id,
      perfil: store.marca.id,
      quando: new Date(a.data).toISOString(),
      tipo: tipoInstagram(a, enviadas.map((e) => e.tipo)),
      legenda,
      midias: enviadas,
      agora: opcoes.agora,
    },
  });
  store.atualizar((e) => ({
    ...e,
    agendamentos: e.agendamentos.map((x) =>
      x.id === a.id
        ? {
            ...x,
            publicarAuto: true,
            status: r.status === "publicada" ? "postado" : "programado",
            publicacao: { status: r.status, erro: null },
          }
        : x,
    ),
  }));
  return r.status;
}

export async function cancelarNoInstagram(store: Store, id: string) {
  await api(`/api/publicacoes?id=${encodeURIComponent(id)}`, { metodo: "DELETE" });
  store.atualizar((e) => ({
    ...e,
    agendamentos: e.agendamentos.map((x) =>
      x.id === id ? { ...x, publicarAuto: false, status: "a_programar", publicacao: { status: "cancelada" } } : x,
    ),
  }));
}

/** Traz do servidor a situação das publicações e atualiza o calendário do perfil ativo. */
export async function sincronizarPublicacoes(store: Store) {
  const { publicacoes } = await api<{ publicacoes: { id: string; status: string; permalink: string | null; erro: string | null }[] }>(
    `/api/publicacoes?perfil=${encodeURIComponent(store.marca.id)}`,
  );
  const mapa = new Map(publicacoes.map((p) => [p.id, p]));
  const atual = store.obter().agendamentos;
  const mudou = atual.some((a) => {
    const p = mapa.get(a.id);
    return p && (p.status !== a.publicacao?.status || p.permalink !== (a.publicacao?.permalink ?? null) || p.erro !== (a.publicacao?.erro ?? null));
  });
  if (!mudou) return;
  const publicados: string[] = [];
  store.atualizar((e) => ({
    ...e,
    agendamentos: e.agendamentos.map((a) => {
      const p = mapa.get(a.id);
      if (!p) return a;
      if (p.status === "publicada" && a.publicacao?.status !== "publicada") publicados.push(a.titulo);
      return {
        ...a,
        publicacao: { status: p.status as NonNullable<Agendamento["publicacao"]>["status"], permalink: p.permalink, erro: p.erro },
        status: p.status === "publicada" ? "postado" : a.status,
      };
    }),
  }));
  publicados.forEach((t) => store.avisar(`Publicado no Instagram: "${t}"`, "ok"));
}

// ---------------- Hook para as telas ----------------

let cache: Conexao[] | null = null;
const ouvintes = new Set<(c: Conexao[]) => void>();
export function atualizarConexoes() {
  return listarConexoes()
    .then((c) => {
      cache = c;
      ouvintes.forEach((f) => f(c));
      return c;
    })
    .catch(() => [] as Conexao[]);
}

/** Situação do Instagram para o perfil ativo: disponível no plano? conectado? */
export function useInstagram(store: Store) {
  const n = store.nuvem;
  const disponivel = !!n && !!n.recursos.instagram && n.instagramConfigurado;
  const [conexoes, setConexoes] = useState<Conexao[] | null>(cache);
  useEffect(() => {
    if (!disponivel) return;
    ouvintes.add(setConexoes);
    if (!cache) void atualizarConexoes();
    return () => {
      ouvintes.delete(setConexoes);
    };
  }, [disponivel]);
  return {
    noPlano: !!n?.recursos.instagram,
    configurado: !!n?.instagramConfigurado,
    disponivel,
    conexao: conexoes?.find((c) => c.perfil_id === store.marca.id),
  };
}
