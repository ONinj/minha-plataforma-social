"use client";

import { useState } from "react";
import { db } from "@/lib/db";
import { useStore } from "@/lib/store";
import type { Midia } from "@/lib/tipos";
import { formatarData } from "@/lib/util";
import { BotaoBaixar, CartaoMidia } from "../MidiaView";
import Icone from "../Icone";
import { BotaoUpload } from "../SeletorMidias";

export default function Midias({ mandarParaCentral }: { mandarParaCentral: (ids: string[]) => void }) {
  const store = useStore();
  const [filtro, setFiltro] = useState<"todas" | "minhas" | "favoritas" | "imagem" | "video">("todas");
  const [busca, setBusca] = useState("");
  const [selecao, setSelecao] = useState<string[]>([]);
  const termo = busca.trim().toLowerCase();
  const midias = store.estado.midias
    .filter((m) => !m.naBiblioteca)
    .filter((m) =>
      filtro === "todas" ? true : filtro === "minhas" ? m.origem === "upload" : filtro === "favoritas" ? m.favorita : m.tipo === filtro,
    )
    .filter((m) => !termo || `${m.titulo} ${m.prompt ?? ""}`.toLowerCase().includes(termo));

  async function excluir(id: string) {
    if (!window.confirm("Excluir esta mídia?")) return;
    await db.apagar(`blob:${id}`);
    store.atualizar((e) => ({ ...e, midias: e.midias.filter((m) => m.id !== id) }));
    setSelecao((s) => s.filter((x) => x !== id));
  }

  function alternarReferencia(m: Midia) {
    store.atualizarMidia(m.id, { referenciaAprovada: !m.referenciaAprovada });
  }

  function alternarSelecao(id: string) {
    setSelecao((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <div className="conteudo">
      <div className="cartao" style={{ marginBottom: 18 }}>
        <h3>
          <Icone nome="pasta" /> Enviar fotos e vídeos
        </h3>
        <p className="ajuda">
          Mande fotos e vídeos reais (de um produto, do seu espaço, seus) para o gerente animar, usar de referência ou
          publicar. O que você envia já fica liberado como referência. Imagens feitas por IA só viram referência depois
          que você aprova, aqui ou quando o gerente pedir.
        </p>
        <div className="linha">
          <BotaoUpload
            rotulo="+ Enviar do computador/celular"
            aoEnviar={(novas) => setSelecao((s) => [...new Set([...s, ...novas.map((m) => m.id)])])}
          />
          <button className="botao" disabled={!selecao.length} onClick={() => mandarParaCentral(selecao)}>
            Mandar {selecao.length ? `${selecao.length} selecionado(s) ` : ""}para o gerente
          </button>
          {selecao.length > 0 && (
            <button className="botao sec" onClick={() => setSelecao([])}>
              Limpar seleção
            </button>
          )}
        </div>
      </div>

      <div className="linha" style={{ marginBottom: 12 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 380 }}>
          <span style={{ position: "absolute", left: 11, top: 10, color: "var(--texto-3)" }}>
            <Icone nome="busca" tamanho={16} />
          </span>
          <input type="search" placeholder="Buscar por título ou prompt…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ paddingLeft: 34 }} />
        </div>
      </div>
      <div className="filtros">
        {(
          [
            ["todas", "Todas"],
            ["minhas", "Enviadas por mim"],
            ["favoritas", "★ Favoritas"],
            ["imagem", "Imagens"],
            ["video", "Vídeos"],
          ] as const
        ).map(([f, nome]) => (
          <button key={f} className={`filtro ${filtro === f ? "ativo" : ""}`} onClick={() => setFiltro(f)}>
            {nome}
          </button>
        ))}
      </div>

      {midias.length === 0 ? (
        <p className="vazio">Nada aqui ainda. Tudo o que você enviar ou as IAs criarem aparece nesta aba.</p>
      ) : (
        <div className="grade-midias">
          {midias.map((m) => {
            const ia = m.origem !== "upload";
            return (
              <div key={m.id} title={m.prompt}>
                <CartaoMidia
                  midia={m}
                  selecionada={selecao.includes(m.id)}
                  acoes={
                    <>
                      {m.status === "pronto" && (
                        <button className="botao sec peq" onClick={() => alternarSelecao(m.id)}>
                          {selecao.includes(m.id) ? "✓ Selecionado" : "Selecionar"}
                        </button>
                      )}
                      <BotaoBaixar midia={m} />
                      <button
                        className="botao sec peq"
                        title={m.favorita ? "Tirar dos favoritos" : "Favoritar"}
                        onClick={() => store.atualizarMidia(m.id, { favorita: !m.favorita })}
                        style={m.favorita ? { color: "var(--alerta)" } : undefined}
                      >
                        {m.favorita ? "★" : "☆"}
                      </button>
                      <button className="botao perigo peq" onClick={() => excluir(m.id)}>
                        Excluir
                      </button>
                    </>
                  }
                />
                <p className="ajuda" style={{ margin: "4px 2px" }}>
                  {formatarData(m.criadoEm)}
                </p>
                {m.tipo === "imagem" && m.status === "pronto" && (
                  <p className="ajuda" style={{ margin: "2px" }}>
                    {!ia ? (
                      <span style={{ color: "var(--ok)" }}>✓ Sua foto: liberada como referência</span>
                    ) : (
                      <label className="linha" style={{ margin: 0, gap: 6, cursor: "pointer" }}>
                        <input type="checkbox" checked={!!m.referenciaAprovada} onChange={() => alternarReferencia(m)} />
                        Aprovada como referência
                      </label>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
