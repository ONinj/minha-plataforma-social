"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { urlSupabase } from "./supabaseUrl";

/** Ligado quando o Supabase está configurado (login, créditos e dados na nuvem). */
export const MODO_NUVEM = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

let _sb: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!_sb) {
    _sb = createClient(urlSupabase(), (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim(), {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return _sb;
}

let contaAtual: string | null = null;
export function definirContaAtual(id: string | null) {
  contaAtual = id;
}
export function idContaAtual() {
  return contaAtual;
}

export async function cabecalhosNuvem(): Promise<Record<string, string>> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  const h: Record<string, string> = {};
  if (token) h.Authorization = `Bearer ${token}`;
  if (contaAtual) h["x-conta-id"] = contaAtual;
  return h;
}

/** Eventos para a plataforma reagir (saldo novo, sem créditos, sessão expirada). */
export const eventosNuvem = typeof window !== "undefined" ? new EventTarget() : null;

export function observarResposta(resp: Response, corpo: { codigo?: string } = {}) {
  const saldo = resp.headers.get("x-saldo");
  if (saldo != null) eventosNuvem?.dispatchEvent(new CustomEvent("saldo", { detail: Number(saldo) }));
  if (resp.status === 401 && corpo.codigo === "sem_login") eventosNuvem?.dispatchEvent(new Event("sessao"));
  if (resp.status === 402) eventosNuvem?.dispatchEvent(new CustomEvent("sem-creditos", { detail: corpo }));
}

export async function api<T>(caminho: string, opcoes: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
  const resp = await fetch(caminho, {
    method: opcoes.metodo ?? (opcoes.corpo ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(await cabecalhosNuvem()) },
    body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
  });
  const j = await resp.json().catch(() => ({}));
  observarResposta(resp, j);
  if (!resp.ok) throw Object.assign(new Error(j.error ?? `Erro ${resp.status}`), { codigo: j.codigo, status: resp.status });
  return j as T;
}

// ---------------- Arquivos no armazenamento ----------------

function caminho(blobId: string) {
  return `${contaAtual}/${blobId.replace(/[^\w.\-]/g, "_")}`;
}

export async function enviarArquivo(blobId: string, blob: Blob): Promise<string> {
  const { url, token, caminho: c } = await api<{ url: string; token: string; caminho: string }>("/api/arquivos", {
    corpo: { acao: "enviar", nome: blobId },
  });
  const { error } = await supabase().storage.from("midias").uploadToSignedUrl(c, token, blob, {
    contentType: blob.type || "application/octet-stream",
    upsert: true,
  });
  if (error) {
    // Alternativa: PUT direto no link assinado.
    const r = await fetch(url, { method: "PUT", body: blob, headers: { "Content-Type": blob.type || "application/octet-stream" } });
    if (!r.ok) throw new Error(`Falha ao enviar arquivo (${error.message})`);
  }
  return c;
}

export async function baixarArquivo(blobId: string): Promise<Blob | undefined> {
  const c = caminho(blobId);
  const { links } = await api<{ links: Record<string, string> }>("/api/arquivos", { corpo: { acao: "ler", caminhos: [c] } });
  const url = links[c];
  if (!url) return undefined;
  const r = await fetch(url);
  if (!r.ok) return undefined;
  return r.blob();
}

export function caminhoNuvem(blobId: string) {
  return caminho(blobId);
}

export async function apagarArquivosNuvem(blobIds: string[]) {
  if (!blobIds.length) return;
  await api("/api/arquivos", { corpo: { acao: "apagar", caminhos: blobIds.map(caminho) } }).catch(() => {});
}
