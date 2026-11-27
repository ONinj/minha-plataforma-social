"use client";

import { useEffect, useMemo, useState } from "react";
import { duracaoFinal, montarVideo, planejarEdicao, transcrever, type Palavra, type PlanoEdicao } from "@/lib/editor";
import { useStore } from "@/lib/store";
import type { Aprovacao, Midia } from "@/lib/tipos";
import { agoraISO, formatarData, novoId } from "@/lib/util";
import type { IdAba } from "../App";
import Icone from "../Icone";
import { BotaoUpload } from "../SeletorMidias";

const SUGESTOES = [
  "Reels de até 30 s com legenda e um gancho forte",
  "Só tirar os silêncios e os erros",
  "Story de 15 s com a melhor parte",
  "Versão quadrada para o feed",
];

type Etapa = "escolher" | "pedir" | "analisando" | "plano" | "montando" | "pronto";

/** Editor de vídeo: o Claude planeja a edição (cortes, legendas, textos) e o navegador monta o vídeo. */
export default function Editor({ ir }: { ir: (a: IdAba) => void }) {
  const store = useStore();
  const videos = store.estado.midias.filter((m) => m.tipo === "video" && m.status === "pronto");
  const logoMidia = store.estado.midias.find((m) => m.pasta === "Identidade visual" && m.tipo === "imagem");
  const [etapa, setEtapa] = useState<Etapa>("escolher");
  const [midia, setMidia] = useState<Midia | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [pedido, setPedido] = useState("");
  const [status, setStatus] = useState("");
  const [palavras, setPalavras] = useState<Palavra[]>([]);
  const [plano, setPlano] = useState<PlanoEdicao | null>(null);
  const [progresso, setProgresso] = useState(0);
  const [resultado, setResultado] = useState<{ blob: Blob; mime: string; url: string } | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);
  const urlOriginal = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => {
    if (urlOriginal) URL.revokeObjectURL(urlOriginal);
  }, [urlOriginal]);

  async function escolher(m: Midia) {
    const b = await store.lerBlob(m.id);
    if (!b) {
      store.avisar("Não encontrei o arquivo deste vídeo neste aparelho.", "erro");
      return;
    }
    setMidia(m);
    setBlob(b);
    setPlano(null);
    setResultado(null);
    setSalvo(null);
    setEtapa("pedir");
  }

  async function analisar() {
    if (!midia || !blob) return;
    setEtapa("analisando");
    try {
      setStatus("Ouvindo o vídeo (transcrição com o tempo de cada palavra)...");
      let p: Palavra[] = [];
      try {
        p = (await transcrever(store, midia, blob)).palavras;
      } catch (e) {
        store.avisar(`Não consegui transcrever (${e instanceof Error ? e.message : e}). Sigo sem legendas.`, "info");
      }
      setPalavras(p);
      setStatus("O Claude está assistindo aos trechos e montando o plano de edição...");
      const pl = await planejarEdicao(store, midia, blob, p, pedido, !!logoMidia);
      if (!p.length) pl.legendas.ativo = false;
      if (!logoMidia) pl.logo.ativo = false;
      setPlano(pl);
      setEtapa("plano");
    } catch (e) {
      store.avisar(e instanceof Error ? e.message : String(e), "erro");
      setEtapa("pedir");
    }
  }

  async function montar() {
    if (!blob || !plano) return;
    setEtapa("montando");
    setProgresso(0);
    try {
      const logo = plano.logo.ativo && logoMidia ? await store.lerBlob(logoMidia.id) : null;
      const r = await montarVideo(blob, plano, palavras, { logo, aoProgresso: setProgresso });
      setResultado({ ...r, url: URL.createObjectURL(r.blob) });
      setEtapa("pronto");
    } catch (e) {
      store.avisar(`Não consegui montar o vídeo: ${e instanceof Error ? e.message : e}`, "erro");
      setEtapa("plano");
    }
  }

  async function salvar(enviarParaAprovacao: boolean) {
    if (!resultado || !plano || !midia) return;
    let id = salvo;
    if (!id) {
      id = novoId("vid");
      const nova: Midia = {
        id,
        tipo: "video",
        titulo: `${plano.titulo} (editado)`,
        origem: "upload",
        status: "pronto",
        mime: resultado.mime,
        criadoEm: agoraISO(),
        duracao: duracaoFinal(plano),
        descricao: plano.resumo,
      };
      await store.salvarBlob(id, resultado.blob);
      store.atualizar((e) => ({ ...e, midias: [nova, ...e.midias] }));
      setSalvo(id);
    }
    if (enviarParaAprovacao) {
      const item: Aprovacao = {
        id: novoId("apr"),
        titulo: plano.titulo,
        tipo: plano.post.tipo,
        redes: ["Instagram"],
        legenda: plano.post.legenda,
        hashtags: plano.post.hashtags,
        dataPublicacao: plano.post.data ?? undefined,
        midias: [id],
        observacoes: [plano.resumo, plano.encaixe].filter(Boolean).join(" "),
        status: "pendente",
        criadoEm: agoraISO(),
      };
      store.atualizar((e) => ({ ...e, aprovacoes: [item, ...e.aprovacoes] }));
      store.avisar("Vídeo enviado para Aprovações.", "ok");
      ir("aprovacoes");
    } else store.avisar("Vídeo salvo em Mídias e envios.", "ok");
  }

  const mudarPlano = (dados: Partial<PlanoEdicao>) => setPlano((p) => (p ? { ...p, ...dados } : p));

  return (
    <div className="conteudo" style={{ maxWidth: 1000 }}>
      <p className="ajuda" style={{ marginTop: 0 }}>
        Mande um vídeo gravado (bruto) e diga o que quer. O Claude ouve, olha os trechos, corta silêncios e erros, coloca
        legendas e textos nas cores da marca e sugere onde o vídeo entra no seu planejamento. O vídeo é montado aqui no
        navegador: deixe esta aba aberta enquanto monta.
      </p>

      {/* 1. Escolher o vídeo */}
      <div className="cartao" style={{ marginBottom: 16 }}>
        <div className="linha" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0 }}>1. Escolha o vídeo</h3>
          <BotaoUpload
            rotulo="Enviar vídeo bruto"
            aceitar="video/*"
            aoEnviar={(novas) => {
              const v = novas.find((m) => m.tipo === "video");
              if (v) void escolher(v);
            }}
          />
        </div>
        {midia ? (
          <div className="linha" style={{ gap: 14, marginTop: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            {urlOriginal && <video src={urlOriginal} controls playsInline style={{ width: 220, maxHeight: 320, borderRadius: 12, background: "#000" }} />}
            <div>
              <b>{midia.titulo}</b>
              <div className="ajuda">{midia.duracao ? `${Math.round(midia.duracao)} s` : ""}</div>
              <button className="botao sec peq" style={{ marginTop: 8 }} onClick={() => { setMidia(null); setBlob(null); setEtapa("escolher"); }}>
                Trocar vídeo
              </button>
            </div>
          </div>
        ) : videos.length ? (
          <div className="grade-midias" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", marginTop: 12 }}>
            {videos.slice(0, 24).map((m) => (
              <button key={m.id} className="cartao" style={{ padding: 10, textAlign: "left", cursor: "pointer" }} onClick={() => escolher(m)}>
                <Icone nome="video" tamanho={18} />
                <div style={{ fontSize: 13, marginTop: 6 }}>{m.titulo}</div>
                <div className="ajuda" style={{ fontSize: 11 }}>{m.naBiblioteca ? `Biblioteca · ${m.pasta ?? ""}` : formatarData(m.criadoEm)}</div>
              </button>
            ))}
          </div>
        ) : (
          <p className="ajuda">Nenhum vídeo ainda. Envie um vídeo gravado no celular.</p>
        )}
      </div>

      {/* 2. Pedido */}
      {midia && (
        <div className="cartao" style={{ marginBottom: 16 }}>
          <h3>2. O que você quer?</h3>
          <div className="filtros" style={{ marginBottom: 8 }}>
            {SUGESTOES.map((s) => (
              <button key={s} className={`filtro ${pedido === s ? "ativo" : ""}`} onClick={() => setPedido(s)}>
                {s}
              </button>
            ))}
          </div>
          <textarea rows={3} value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="Ex.: reels de 30 s para divulgar a promoção de sexta, com legenda e o logo no final" />
          <div className="linha" style={{ justifyContent: "space-between", marginTop: 10, flexWrap: "wrap", gap: 8 }}>
            <span className="ajuda" style={{ margin: 0 }}>Usa créditos da transcrição e do Claude (poucos créditos por vídeo). Montar o vídeo não gasta créditos.</span>
            <button className="botao" disabled={etapa === "analisando" || etapa === "montando"} onClick={analisar}>
              {etapa === "analisando" ? "Analisando..." : plano ? "Refazer o plano" : "Analisar com o Claude"}
            </button>
          </div>
          {etapa === "analisando" && (
            <p className="ajuda" style={{ marginBottom: 0 }}>
              <span className="girando" style={{ display: "inline-block", width: 14, height: 14, verticalAlign: "middle", marginRight: 8 }} />
              {status}
            </p>
          )}
        </div>
      )}

      {/* 3. Plano */}
      {plano && (etapa === "plano" || etapa === "montando" || etapa === "pronto") && (
        <div className="cartao" style={{ marginBottom: 16 }}>
          <h3>3. Plano de edição</h3>
          {plano.resumo && <p style={{ marginTop: 0 }}>{plano.resumo}</p>}
          {plano.encaixe && <p className="ajuda">📅 {plano.encaixe}</p>}
          <div className="grade-2">
            <div className="campo">
              <label>Formato</label>
              <select value={plano.formato} onChange={(e) => mudarPlano({ formato: e.target.value as PlanoEdicao["formato"] })}>
                <option value="9:16">9:16 (reels e stories)</option>
                <option value="4:5">4:5 (feed)</option>
                <option value="1:1">1:1 (quadrado)</option>
                <option value="original">Original</option>
              </select>
            </div>
            <div className="campo">
              <label>Duração final</label>
              <input type="text" readOnly value={`${duracaoFinal(plano).toFixed(1)} s em ${plano.cortes.length} trecho(s)`} />
            </div>
          </div>
          <label>Trechos que ficam (segundos do vídeo original)</label>
          <div className="lista" style={{ gap: 6, margin: "6px 0 12px" }}>
            {plano.cortes.map((c, i) => (
              <div key={i} className="linha" style={{ gap: 8 }}>
                <span className="ajuda" style={{ width: 24 }}>{i + 1}.</span>
                <input type="number" step="0.1" value={c.inicio} style={{ width: 90 }} onChange={(e) => mudarPlano({ cortes: plano.cortes.map((x, k) => (k === i ? { ...x, inicio: Number(e.target.value) } : x)) })} />
                <span>até</span>
                <input type="number" step="0.1" value={c.fim} style={{ width: 90 }} onChange={(e) => mudarPlano({ cortes: plano.cortes.map((x, k) => (k === i ? { ...x, fim: Number(e.target.value) } : x)) })} />
                <button className="botao sec peq" disabled={plano.cortes.length < 2} onClick={() => mudarPlano({ cortes: plano.cortes.filter((_, k) => k !== i) })}>
                  Tirar
                </button>
              </div>
            ))}
          </div>
          <div className="linha" style={{ gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
            <label className="linha" style={{ margin: 0, gap: 6 }}>
              <input type="checkbox" checked={plano.legendas.ativo} disabled={!palavras.length} onChange={(e) => mudarPlano({ legendas: { ...plano.legendas, ativo: e.target.checked } })} />
              Legendas {palavras.length ? "" : "(sem fala no vídeo)"}
            </label>
            {plano.legendas.ativo && (
              <>
                <label className="linha" style={{ margin: 0, gap: 6 }}>
                  Cor <input type="color" value={plano.legendas.cor} onChange={(e) => mudarPlano({ legendas: { ...plano.legendas, cor: e.target.value } })} />
                </label>
                <label className="linha" style={{ margin: 0, gap: 6 }}>
                  Destaque <input type="color" value={plano.legendas.destaque} onChange={(e) => mudarPlano({ legendas: { ...plano.legendas, destaque: e.target.value } })} />
                </label>
                <select value={plano.legendas.posicao} style={{ width: "auto" }} onChange={(e) => mudarPlano({ legendas: { ...plano.legendas, posicao: e.target.value as "baixo" } })}>
                  <option value="baixo">Embaixo</option>
                  <option value="meio">No meio</option>
                  <option value="topo">Em cima</option>
                </select>
                <select value={plano.legendas.tamanho} style={{ width: "auto" }} onChange={(e) => mudarPlano({ legendas: { ...plano.legendas, tamanho: e.target.value as "m" } })}>
                  <option value="p">Pequena</option>
                  <option value="m">Média</option>
                  <option value="g">Grande</option>
                </select>
              </>
            )}
            <label className="linha" style={{ margin: 0, gap: 6 }} title={logoMidia ? "" : "Envie o logo no questionário do perfil ou na pasta Identidade visual da Biblioteca"}>
              <input type="checkbox" checked={plano.logo.ativo} disabled={!logoMidia} onChange={(e) => mudarPlano({ logo: { ...plano.logo, ativo: e.target.checked } })} />
              Logo {logoMidia ? "" : "(nenhum logo salvo)"}
            </label>
          </div>
          {plano.textos.length > 0 && (
            <>
              <label>Textos na tela (segundos do vídeo final)</label>
              <div className="lista" style={{ gap: 6, margin: "6px 0 12px" }}>
                {plano.textos.map((t, i) => (
                  <div key={i} className="linha" style={{ gap: 8, flexWrap: "wrap" }}>
                    <input type="text" value={t.texto} style={{ flex: 1, minWidth: 180 }} onChange={(e) => mudarPlano({ textos: plano.textos.map((x, k) => (k === i ? { ...x, texto: e.target.value } : x)) })} />
                    <input type="number" step="0.1" value={t.inicio} style={{ width: 80 }} onChange={(e) => mudarPlano({ textos: plano.textos.map((x, k) => (k === i ? { ...x, inicio: Number(e.target.value) } : x)) })} />
                    <input type="number" step="0.1" value={t.fim} style={{ width: 80 }} onChange={(e) => mudarPlano({ textos: plano.textos.map((x, k) => (k === i ? { ...x, fim: Number(e.target.value) } : x)) })} />
                    <button className="botao sec peq" onClick={() => mudarPlano({ textos: plano.textos.filter((_, k) => k !== i) })}>Tirar</button>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="linha" style={{ justifyContent: "flex-end" }}>
            <button className="botao" disabled={etapa === "montando"} onClick={montar}>
              {etapa === "montando" ? "Montando..." : resultado ? "Montar de novo" : "Montar o vídeo"}
            </button>
          </div>
          {etapa === "montando" && (
            <>
              <div className="barra" style={{ marginTop: 10 }}>
                <div style={{ width: `${Math.round(progresso * 100)}%` }} />
              </div>
              <p className="ajuda" style={{ marginBottom: 0 }}>Montando em tempo real ({Math.round(progresso * 100)}%). Deixe esta aba aberta e visível.</p>
            </>
          )}
        </div>
      )}

      {/* 4. Resultado */}
      {resultado && plano && etapa === "pronto" && (
        <div className="cartao">
          <h3>4. Pronto!</h3>
          <div className="linha" style={{ gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <video src={resultado.url} controls playsInline style={{ width: 260, maxHeight: 460, borderRadius: 12, background: "#000" }} />
            <div style={{ flex: 1, minWidth: 240 }}>
              {plano.post.legenda && (
                <div className="campo">
                  <label>Legenda sugerida</label>
                  <textarea rows={5} value={plano.post.legenda} onChange={(e) => mudarPlano({ post: { ...plano.post, legenda: e.target.value } })} />
                </div>
              )}
              <div className="campo">
                <label>Hashtags</label>
                <input type="text" value={plano.post.hashtags} onChange={(e) => mudarPlano({ post: { ...plano.post, hashtags: e.target.value } })} />
              </div>
              <div className="campo">
                <label>Data sugerida</label>
                <input type="datetime-local" value={plano.post.data ?? ""} onChange={(e) => mudarPlano({ post: { ...plano.post, data: e.target.value || null } })} />
              </div>
              {resultado.mime.includes("webm") && (
                <p className="ajuda" style={{ fontSize: 12 }}>
                  ⚠️ Este navegador gravou em WebM. Para postar no Instagram, use o Chrome ou o Edge atualizados (que gravam em MP4).
                </p>
              )}
              <div className="linha" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="botao ok" onClick={() => salvar(true)}>Enviar para aprovação</button>
                <button className="botao sec" onClick={() => salvar(false)}>{salvo ? "Salvo em Mídias" : "Só salvar em Mídias"}</button>
                <a className="botao sec" style={{ textDecoration: "none" }} href={resultado.url} download={`${plano.titulo}.${resultado.mime.includes("mp4") ? "mp4" : "webm"}`}>
                  <Icone nome="baixar" tamanho={15} /> Baixar
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
