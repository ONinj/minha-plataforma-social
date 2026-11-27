"use client";

import { useEffect, useState } from "react";
import { criarLinkAprovacao, listarLinksAprovacao, revogarLinkAprovacao, type LinkAprovacao } from "@/lib/aprovacaoCliente";
import { useStore } from "@/lib/store";
import { formatarData } from "@/lib/util";
import Icone from "./Icone";

/** Janela para escolher as peças e gerar o link que o cliente final abre no celular, sem login. */
export default function EnviarCliente({ aoFechar }: { aoFechar: () => void }) {
  const store = useStore();
  const pendentes = store.estado.aprovacoes.filter((a) => a.status === "pendente" || a.status === "ajuste");
  const [escolhidas, setEscolhidas] = useState<string[]>(pendentes.map((a) => a.id));
  const [nome, setNome] = useState("");
  const [dias, setDias] = useState(14);
  const [gerando, setGerando] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [links, setLinks] = useState<LinkAprovacao[] | null>(null);

  const carregarLinks = () => listarLinksAprovacao(store.marca.id).then(setLinks).catch(() => setLinks([]));
  useEffect(() => {
    void carregarLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function gerar() {
    setGerando(true);
    try {
      // Garante que as peças já estão salvas na nuvem antes de criar o link.
      await new Promise((r) => setTimeout(r, 1500));
      const r = await criarLinkAprovacao(store.marca.id, escolhidas, dias, nome.trim() || undefined);
      setLink(r.url);
      void carregarLinks();
    } catch (e) {
      store.avisar(e instanceof Error ? e.message : String(e), "erro");
    } finally {
      setGerando(false);
    }
  }

  const mensagem = link
    ? `Oi${nome.trim() ? `, ${nome.trim()}` : ""}! Separei as próximas publicações de ${store.marca.nome} para você aprovar. É só abrir o link, ver cada peça e tocar em Aprovar ou Pedir ajuste: ${link}`
    : "";

  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <h3>Enviar para o cliente aprovar</h3>
        {!link ? (
          <>
            <p className="ajuda" style={{ marginTop: -4 }}>
              O cliente abre o link no celular, sem precisar de login, vê só as peças escolhidas e aprova ou pede ajuste. As
              respostas aparecem aqui em Aprovações.
            </p>
            {pendentes.length === 0 ? (
              <p className="ajuda">Não há peças aguardando aprovação neste perfil.</p>
            ) : (
              <div className="lista" style={{ gap: 6, maxHeight: 260, overflowY: "auto", marginBottom: 12 }}>
                {pendentes.map((a) => (
                  <label key={a.id} className="linha" style={{ margin: 0, gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={escolhidas.includes(a.id)}
                      onChange={(e) => setEscolhidas((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))}
                    />
                    <span>
                      {a.titulo} <span className="ajuda">· {a.tipo}{a.dataPublicacao ? ` · ${formatarData(a.dataPublicacao)}` : ""}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div className="grade-2">
              <div className="campo">
                <label>Nome do cliente (opcional)</label>
                <input type="text" value={nome} maxLength={80} placeholder="Ex.: Carla" onChange={(e) => setNome(e.target.value)} />
              </div>
              <div className="campo">
                <label>O link vale por</label>
                <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
                  <option value={3}>3 dias</option>
                  <option value={7}>7 dias</option>
                  <option value={14}>14 dias</option>
                  <option value={30}>30 dias</option>
                </select>
              </div>
            </div>
            <div className="linha" style={{ justifyContent: "flex-end" }}>
              <button className="botao sec" onClick={aoFechar}>Cancelar</button>
              <button className="botao" disabled={gerando || !escolhidas.length} onClick={gerar}>
                {gerando ? "Gerando..." : `Gerar link (${escolhidas.length} peça${escolhidas.length === 1 ? "" : "s"})`}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="ajuda" style={{ marginTop: -4 }}>Pronto! Mande este link para o cliente:</p>
            <input type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
            <div className="linha" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button
                className="botao"
                onClick={async () => {
                  await navigator.clipboard.writeText(mensagem);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2000);
                }}
              >
                <Icone nome="copiar" tamanho={15} /> {copiado ? "Copiado!" : "Copiar mensagem com o link"}
              </button>
              <a className="botao sec" style={{ textDecoration: "none" }} href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noreferrer">
                Enviar pelo WhatsApp
              </a>
              <button className="botao sec" onClick={aoFechar}>Fechar</button>
            </div>
            <p className="ajuda" style={{ fontSize: 12 }}>
              Guarde o link: por segurança, ele só aparece agora. Se perder, gere outro.
            </p>
          </>
        )}

        {links && links.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <b style={{ fontSize: 13 }}>Links deste perfil</b>
            <div className="lista" style={{ gap: 6, marginTop: 6 }}>
              {links.map((l) => {
                const vencido = new Date(l.expira_em) < new Date();
                return (
                  <div key={l.id} className="linha" style={{ justifyContent: "space-between", fontSize: 13 }}>
                    <span>
                      {l.nome || "Sem nome"} · {l.itens} peça(s) · {l.respostas} resposta(s)
                      <span className="ajuda"> · {l.revogado ? "desativado" : vencido ? "vencido" : `vale até ${formatarData(l.expira_em).split(",")[0]}`}</span>
                    </span>
                    {!l.revogado && !vencido && (
                      <button
                        className="botao perigo peq"
                        onClick={async () => {
                          if (!window.confirm("Desativar este link? O cliente não vai mais conseguir abrir.")) return;
                          await revogarLinkAprovacao(l.id).catch((e) => store.avisar(String(e.message), "erro"));
                          void carregarLinks();
                        }}
                      >
                        Desativar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
