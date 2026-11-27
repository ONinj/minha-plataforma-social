"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/nuvem";
import { useStore } from "@/lib/store";
import Icone from "../Icone";

type Depoimento = { id?: string; nome: string; cargo: string | null; texto: string; nota: number; publicado: boolean; ordem: number };
const vazio: Depoimento = { nome: "", cargo: "", texto: "", nota: 5, publicado: true, ordem: 0 };

/** Depoimentos reais de clientes que aparecem na página de vendas. */
export default function Depoimentos() {
  const store = useStore();
  const [lista, setLista] = useState<Depoimento[] | null>(null);
  const [editando, setEditando] = useState<Depoimento | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(() => {
    api<{ depoimentos: Depoimento[] }>("/api/admin/depoimentos").then((r) => setLista(r.depoimentos)).catch((e) => setErro(String(e.message)));
  }, []);
  useEffect(carregar, [carregar]);

  async function salvar(d: Depoimento) {
    try {
      await api("/api/admin/depoimentos", { corpo: { acao: "salvar", ...d } });
      setEditando(null);
      carregar();
      store.avisar("Depoimento salvo.", "ok");
    } catch (e) {
      store.avisar(String((e as Error).message), "erro");
    }
  }
  async function apagar(id: string) {
    if (!confirm("Apagar este depoimento?")) return;
    await api("/api/admin/depoimentos", { corpo: { acao: "apagar", id } }).catch(() => {});
    carregar();
  }

  if (erro) return <div className="aviso erro">{erro.includes("depoimentos") || erro.includes("500") ? "Falta rodar a atualização do banco (supabase/migrations/010_suporte.sql)." : erro}</div>;
  if (!lista) return <div className="girando" />;
  return (
    <div className="lista">
      <div className="aviso info">
        Cadastre aqui o que clientes de verdade disseram (com a permissão deles). Os publicados aparecem na página de vendas, na seção
        &quot;O que dizem&quot;. Enquanto não houver nenhum publicado, a seção fica escondida.
      </div>
      <div className="linha" style={{ justifyContent: "flex-end" }}>
        <button className="botao" onClick={() => setEditando({ ...vazio, ordem: lista.length })}><Icone nome="mais" tamanho={15} /> Novo depoimento</button>
      </div>
      {lista.length === 0 && <p className="vazio">Nenhum depoimento ainda.</p>}
      {lista.map((d) => (
        <div key={d.id} className="cartao">
          <div className="linha" style={{ justifyContent: "space-between", gap: 10 }}>
            <div>
              <b>{d.nome}</b> {d.cargo && <span className="ajuda">· {d.cargo}</span>}{" "}
              <span className="vendas-estrelas">{"★".repeat(d.nota)}</span>{" "}
              <span className="etiqueta">{d.publicado ? "Publicado" : "Rascunho"}</span>
            </div>
            <span className="linha" style={{ gap: 6 }}>
              <button className="botao sec peq" onClick={() => setEditando(d)}>Editar</button>
              <button className="botao sec peq" onClick={() => salvar({ ...d, publicado: !d.publicado })}>{d.publicado ? "Esconder" : "Publicar"}</button>
              <button className="botao-icone" onClick={() => apagar(d.id!)} aria-label="Apagar"><Icone nome="lixo" tamanho={15} /></button>
            </span>
          </div>
          <p className="ajuda" style={{ marginBottom: 0 }}>&ldquo;{d.texto}&rdquo;</p>
        </div>
      ))}

      {editando && (
        <div className="modal-fundo" onClick={() => setEditando(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editando.id ? "Editar depoimento" : "Novo depoimento"}</h3>
            <div className="lista" style={{ gap: 10 }}>
              <input type="text" placeholder="Nome (ex.: Mariana Souza)" value={editando.nome} maxLength={80} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
              <input type="text" placeholder="Cargo ou empresa (ex.: Social media, Agência Bambu)" value={editando.cargo ?? ""} maxLength={80} onChange={(e) => setEditando({ ...editando, cargo: e.target.value })} />
              <textarea placeholder="O que a pessoa disse" value={editando.texto} maxLength={600} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} style={{ minHeight: 110 }} />
              <div className="linha" style={{ gap: 12, flexWrap: "wrap" }}>
                <label className="linha" style={{ gap: 6 }}>
                  Nota
                  <select value={editando.nota} onChange={(e) => setEditando({ ...editando, nota: Number(e.target.value) })} style={{ width: "auto" }}>
                    {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
                  </select>
                </label>
                <label className="linha" style={{ gap: 6 }}>
                  Ordem
                  <input type="number" value={editando.ordem} onChange={(e) => setEditando({ ...editando, ordem: Number(e.target.value) })} style={{ width: 70 }} />
                </label>
                <label className="linha" style={{ gap: 6 }}>
                  <input type="checkbox" checked={editando.publicado} onChange={(e) => setEditando({ ...editando, publicado: e.target.checked })} /> Publicar na página de vendas
                </label>
              </div>
              <div className="linha" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button className="botao sec" onClick={() => setEditando(null)}>Cancelar</button>
                <button className="botao" disabled={!editando.nome.trim() || !editando.texto.trim()} onClick={() => salvar(editando)}>Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
