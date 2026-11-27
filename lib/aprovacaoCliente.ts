"use client";

import { api } from "./nuvem";
import type { useStore } from "./store";

type Store = ReturnType<typeof useStore>;

export type LinkAprovacao = { id: string; nome: string | null; criado_em: string; expira_em: string; revogado: boolean; itens: number; respostas: number };

export async function criarLinkAprovacao(perfil: string, itens: string[], dias: number, nome?: string) {
  return api<{ id: string; url: string; expira_em: string; itens: number }>("/api/links-aprovacao", { corpo: { perfil, itens, dias, nome } });
}

export async function listarLinksAprovacao(perfil: string) {
  return (await api<{ links: LinkAprovacao[] }>(`/api/links-aprovacao?perfil=${encodeURIComponent(perfil)}`)).links;
}

export async function revogarLinkAprovacao(id: string) {
  await api(`/api/links-aprovacao?id=${encodeURIComponent(id)}`, { metodo: "DELETE" });
}

/** Traz as respostas novas dos clientes e marca nas peças do perfil ativo. */
export async function sincronizarDecisoes(store: Store) {
  if (!store.nuvem) return;
  const perfil = store.marca.id;
  const chave = `decisoes-desde:${perfil}`;
  let desde = "";
  try {
    desde = localStorage.getItem(chave) ?? "";
  } catch {}
  const { decisoes } = await api<{ decisoes: { aprovacao_id: string; decisao: "aprovado" | "ajuste"; comentario: string | null; nome: string | null; em: string }[] }>(
    `/api/decisoes-cliente?perfil=${encodeURIComponent(perfil)}&desde=${encodeURIComponent(desde)}`,
  );
  if (!decisoes.length) return;
  const atuais = new Map(store.obter().aprovacoes.map((a) => [a.id, a]));
  const novas = decisoes.filter((d) => {
    const a = atuais.get(d.aprovacao_id);
    return a && (!a.cliente || new Date(a.cliente.em) < new Date(d.em));
  });
  if (novas.length) {
    const mapa = new Map(novas.map((d) => [d.aprovacao_id, d]));
    store.atualizar((e) => ({
      ...e,
      aprovacoes: e.aprovacoes.map((a) => {
        const d = mapa.get(a.id);
        return d ? { ...a, cliente: { decisao: d.decisao, comentario: d.comentario, nome: d.nome, em: d.em } } : a;
      }),
    }));
    const aprovados = novas.filter((d) => d.decisao === "aprovado").length;
    const ajustes = novas.length - aprovados;
    store.avisar(
      `O cliente respondeu: ${[aprovados && `${aprovados} aprovada(s)`, ajustes && `${ajustes} pedido(s) de ajuste`].filter(Boolean).join(" e ")}. Veja em Aprovações.`,
      "ok",
    );
  }
  try {
    localStorage.setItem(chave, decisoes[decisoes.length - 1].em);
  } catch {}
}
