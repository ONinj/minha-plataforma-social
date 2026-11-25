"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { TextoSalvo } from "@/lib/tipos";
import { agoraISO, formatarData, novoId } from "@/lib/util";
import Icone from "../Icone";

const TIPOS: Record<TextoSalvo["tipo"], string> = {
  hashtags: "Hashtags",
  legenda: "Legenda",
  cta: "Chamada (CTA)",
  outro: "Outro",
};

export default function Ideias({ falarComGerente }: { falarComGerente: (t: string) => void }) {
  const store = useStore();
  const { estado } = store;
  const [nova, setNova] = useState("");
  const [mostrarFeitas, setMostrarFeitas] = useState(false);
  const [texto, setTexto] = useState({ titulo: "", texto: "", tipo: "hashtags" as TextoSalvo["tipo"] });
  const [copiado, setCopiado] = useState<string>();

  const ideias = estado.ideias.filter((i) => mostrarFeitas || !i.feita);

  function adicionarIdeia() {
    if (!nova.trim()) return;
    store.atualizar((e) => ({ ...e, ideias: [{ id: novoId("ide"), texto: nova.trim(), feita: false, criadoEm: agoraISO() }, ...e.ideias] }));
    setNova("");
  }

  function adicionarTexto() {
    if (!texto.texto.trim()) return;
    store.atualizar((e) => ({
      ...e,
      textos: [{ id: novoId("txt"), titulo: texto.titulo.trim() || TIPOS[texto.tipo], texto: texto.texto.trim(), tipo: texto.tipo }, ...e.textos],
    }));
    setTexto({ titulo: "", texto: "", tipo: texto.tipo });
  }

  async function copiar(t: TextoSalvo) {
    await navigator.clipboard.writeText(t.texto);
    setCopiado(t.id);
    setTimeout(() => setCopiado(undefined), 1500);
  }

  return (
    <div className="conteudo">
      <div className="grade-2" style={{ alignItems: "start" }}>
        <div className="cartao">
          <h3>
            <Icone nome="ideia" /> Banco de ideias
          </h3>
          <p className="ajuda" style={{ marginTop: -4 }}>
            Anote ideias de post na hora que elas aparecem. Depois é só mandar para o gerente produzir.
          </p>
          <textarea
            rows={3}
            value={nova}
            placeholder="Ex.: vídeo mostrando o preparo do café coado em câmera lenta"
            onChange={(e) => setNova(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) adicionarIdeia();
            }}
          />
          <div className="linha" style={{ margin: "10px 0 16px", justifyContent: "space-between" }}>
            <label className="linha" style={{ margin: 0, cursor: "pointer" }}>
              <input type="checkbox" checked={mostrarFeitas} onChange={(e) => setMostrarFeitas(e.target.checked)} />
              Mostrar as já feitas
            </label>
            <button className="botao" onClick={adicionarIdeia} disabled={!nova.trim()}>
              <Icone nome="mais" /> Anotar
            </button>
          </div>
          {ideias.length === 0 ? (
            <p className="vazio" style={{ padding: 20 }}>
              Nenhuma ideia anotada.
            </p>
          ) : (
            <div className="lista" style={{ gap: 8 }}>
              {ideias.map((i) => (
                <div key={i.id} className={`ideia ${i.feita ? "feita" : ""}`}>
                  <input
                    type="checkbox"
                    checked={i.feita}
                    title="Marcar como feita"
                    onChange={() =>
                      store.atualizar((e) => ({ ...e, ideias: e.ideias.map((x) => (x.id === i.id ? { ...x, feita: !x.feita } : x)) }))
                    }
                  />
                  <div style={{ flex: 1 }}>
                    <p>{i.texto}</p>
                    <span className="ajuda" style={{ fontSize: 11.5 }}>{formatarData(i.criadoEm)}</span>
                  </div>
                  <div className="linha" style={{ gap: 6 }}>
                    <button
                      className="botao sec peq"
                      title="Mandar para o gerente produzir"
                      onClick={() => {
                        store.atualizar((e) => ({ ...e, ideias: e.ideias.map((x) => (x.id === i.id ? { ...x, feita: true } : x)) }));
                        falarComGerente(`Tenho esta ideia de conteúdo: "${i.texto}". Produza e envie para aprovação.`);
                      }}
                    >
                      <Icone nome="enviar" tamanho={14} /> Produzir
                    </button>
                    <button
                      className="botao-icone"
                      style={{ width: 30, height: 30 }}
                      title="Excluir"
                      onClick={() => store.atualizar((e) => ({ ...e, ideias: e.ideias.filter((x) => x.id !== i.id) }))}
                    >
                      <Icone nome="lixo" tamanho={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="cartao">
          <h3>
            <Icone nome="copiar" /> Textos salvos
          </h3>
          <p className="ajuda" style={{ marginTop: -4 }}>
            Grupos de hashtags, legendas e chamadas que você usa sempre. Um clique copia.
          </p>
          <div className="grade-2" style={{ gap: 10 }}>
            <input type="text" placeholder="Título (ex.: Hashtags café)" value={texto.titulo} onChange={(e) => setTexto({ ...texto, titulo: e.target.value })} />
            <select value={texto.tipo} onChange={(e) => setTexto({ ...texto, tipo: e.target.value as TextoSalvo["tipo"] })}>
              {Object.entries(TIPOS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <textarea
            rows={3}
            style={{ marginTop: 10 }}
            placeholder="#cafe #cafeespecial #curitiba ..."
            value={texto.texto}
            onChange={(e) => setTexto({ ...texto, texto: e.target.value })}
          />
          <div className="linha" style={{ justifyContent: "flex-end", margin: "10px 0 16px" }}>
            <button className="botao" onClick={adicionarTexto} disabled={!texto.texto.trim()}>
              <Icone nome="mais" /> Salvar texto
            </button>
          </div>
          {estado.textos.length === 0 ? (
            <p className="vazio" style={{ padding: 20 }}>
              Nenhum texto salvo.
            </p>
          ) : (
            <div className="lista" style={{ gap: 8 }}>
              {estado.textos.map((t) => (
                <div key={t.id} className="ideia" style={{ flexDirection: "column", gap: 6 }}>
                  <div className="linha" style={{ width: "100%", justifyContent: "space-between" }}>
                    <b>{t.titulo}</b>
                    <span className="etiqueta">{TIPOS[t.tipo]}</span>
                  </div>
                  <p className="ajuda" style={{ whiteSpace: "pre-wrap" }}>{t.texto}</p>
                  <div className="linha" style={{ gap: 6 }}>
                    <button className="botao sec peq" onClick={() => copiar(t)}>
                      <Icone nome={copiado === t.id ? "check" : "copiar"} tamanho={14} /> {copiado === t.id ? "Copiado!" : "Copiar"}
                    </button>
                    <button
                      className="botao perigo peq"
                      onClick={() => store.atualizar((e) => ({ ...e, textos: e.textos.filter((x) => x.id !== t.id) }))}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
