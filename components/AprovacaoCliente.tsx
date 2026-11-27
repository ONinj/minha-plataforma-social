"use client";

import { useEffect, useState } from "react";
import Logo from "./Logo";

type Item = {
  id: string; titulo: string; tipo: string; redes: string[]; legenda: string; hashtags: string; data: string | null;
  midias: { tipo: "imagem" | "video"; url: string }[];
};
type Decisao = { aprovacao_id: string; decisao: "aprovado" | "ajuste"; comentario: string | null; nome: string | null; em: string };
type Dados = { marca: { nome: string; arroba: string; cor: string }; nome: string | null; expira_em: string; itens: Item[]; decisoes: Decisao[] };

const TIPO: Record<string, string> = { post: "Post", carrossel: "Carrossel", reels: "Reels", story: "Story", planejamento: "Planejamento", outro: "Peça" };

function dataBonita(d: string | null) {
  if (!d) return null;
  const x = new Date(d);
  return isNaN(x.getTime()) ? null : x.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Página do cliente final: vê as peças e aprova ou pede ajuste, sem login. */
export default function AprovacaoCliente({ token }: { token: string }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [decisoes, setDecisoes] = useState<Record<string, Decisao>>({});

  useEffect(() => {
    try {
      setNome(localStorage.getItem("aprovacao-nome") ?? "");
    } catch {}
    fetch(`/api/aprovar/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Não consegui abrir.");
        setDados(j);
        setDecisoes(Object.fromEntries((j.decisoes as Decisao[]).map((d) => [d.aprovacao_id, d])));
        if (j.nome) setNome((n) => n || j.nome);
      })
      .catch((e) => setErro(e.message));
  }, [token]);

  if (erro) {
    return (
      <div className="tela-login">
        <div className="login-caixa" style={{ textAlign: "center" }}>
          <Logo tamanho={40} />
          <h2 className="titulo-pagina">Link indisponível</h2>
          <p className="ajuda">{erro}</p>
        </div>
      </div>
    );
  }
  if (!dados) return <div className="tela-login"><div className="girando" /></div>;

  const respondidas = dados.itens.filter((i) => decisoes[i.id]).length;
  const { marca } = dados;

  return (
    <div className="aprovar">
      <header className="aprovar-topo" style={{ borderTopColor: marca.cor }}>
        <div className="aprovar-largura">
          <div className="linha" style={{ gap: 12 }}>
            <span className="aprovar-avatar" style={{ background: marca.cor }}>{marca.nome.slice(0, 2).toUpperCase()}</span>
            <div>
              <b style={{ fontSize: 17 }}>{marca.nome}</b>
              {marca.arroba && <div className="ajuda" style={{ margin: 0 }}>@{marca.arroba}</div>}
            </div>
          </div>
          <h1>Conteúdos para você aprovar</h1>
          <p className="ajuda" style={{ margin: 0 }}>
            Veja cada peça e toque em <b>Aprovar</b> ou <b>Pedir ajuste</b>. {respondidas} de {dados.itens.length} respondida(s).
          </p>
          <div className="barra" style={{ marginTop: 10 }}>
            <div style={{ width: `${dados.itens.length ? (respondidas / dados.itens.length) * 100 : 0}%` }} />
          </div>
          <div className="campo" style={{ marginTop: 14, marginBottom: 0 }}>
            <label>Seu nome (para quem cuida das redes saber quem respondeu)</label>
            <input
              type="text"
              value={nome}
              maxLength={80}
              placeholder="Ex.: Carla"
              onChange={(e) => {
                setNome(e.target.value);
                try {
                  localStorage.setItem("aprovacao-nome", e.target.value);
                } catch {}
              }}
            />
          </div>
        </div>
      </header>

      <main className="aprovar-largura" style={{ paddingBottom: 40 }}>
        {dados.itens.length === 0 && <p className="ajuda" style={{ textAlign: "center", marginTop: 30 }}>Não há peças neste link.</p>}
        {dados.itens.map((i) => (
          <CartaoPeca
            key={i.id}
            token={token}
            item={i}
            nome={nome}
            decisao={decisoes[i.id]}
            aoResponder={(d) => setDecisoes((s) => ({ ...s, [i.id]: d }))}
          />
        ))}
        {dados.itens.length > 0 && respondidas === dados.itens.length && (
          <div className="cartao" style={{ textAlign: "center", marginTop: 16 }}>
            <h3 style={{ justifyContent: "center", margin: 0 }}>🎉 Tudo respondido!</h3>
            <p className="ajuda" style={{ marginBottom: 0 }}>Obrigado! Quem cuida das suas redes já recebeu as suas respostas.</p>
          </div>
        )}
        <p className="ajuda" style={{ textAlign: "center", fontSize: 12, marginTop: 24 }}>
          Link válido até {new Date(dados.expira_em).toLocaleDateString("pt-BR")} · feito com <b>Galhos</b>
        </p>
      </main>
    </div>
  );
}

function CartaoPeca({
  token, item, nome, decisao, aoResponder,
}: {
  token: string; item: Item; nome: string; decisao?: Decisao; aoResponder: (d: Decisao) => void;
}) {
  const [ajustando, setAjustando] = useState(false);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mudar, setMudar] = useState(false);
  const data = dataBonita(item.data);

  async function responder(d: "aprovado" | "ajuste") {
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/aprovar/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aprovacao: item.id, decisao: d, comentario: d === "ajuste" ? comentario : undefined, nome }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Não consegui enviar. Tente de novo.");
      aoResponder({ aprovacao_id: item.id, decisao: d, comentario: d === "ajuste" ? comentario : null, nome, em: new Date().toISOString() });
      setAjustando(false);
      setMudar(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  const respondido = decisao && !mudar;
  return (
    <article className="cartao aprovar-peca">
      <div className="linha" style={{ justifyContent: "space-between", gap: 8 }}>
        <b style={{ fontSize: 16 }}>{item.titulo}</b>
        <span className="etiqueta">{TIPO[item.tipo] ?? item.tipo}</span>
      </div>
      {(data || item.redes.length > 0) && (
        <p className="ajuda" style={{ margin: "4px 0 10px" }}>
          {data ? `📅 ${data}` : ""}
          {data && item.redes.length ? " · " : ""}
          {item.redes.join(", ")}
        </p>
      )}
      {item.midias.length > 0 && (
        <div className={`aprovar-midias ${item.midias.length > 1 ? "varias" : ""}`}>
          {item.midias.map((m, k) =>
            m.tipo === "video" ? (
              <video key={k} src={m.url} controls playsInline preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={k} src={m.url} alt={`${item.titulo} ${k + 1}`} loading="lazy" />
            ),
          )}
        </div>
      )}
      {(item.legenda || item.hashtags) && (
        <div className="aprovar-legenda">
          {item.legenda}
          {item.hashtags ? `\n\n${item.hashtags}` : ""}
        </div>
      )}

      {respondido ? (
        <div className="linha" style={{ justifyContent: "space-between", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
          <b style={{ color: decisao.decisao === "aprovado" ? "var(--ok)" : "var(--alerta)" }}>
            {decisao.decisao === "aprovado" ? "✅ Aprovado" : `✏️ Ajuste pedido: “${decisao.comentario}”`}
          </b>
          <button className="link-botao" onClick={() => { setMudar(true); setComentario(decisao.comentario ?? ""); }}>Mudar resposta</button>
        </div>
      ) : ajustando ? (
        <div style={{ marginTop: 12 }}>
          <textarea
            rows={3}
            maxLength={1000}
            value={comentario}
            placeholder="O que precisa mudar? Ex.: trocar a foto, deixar a legenda mais curta..."
            onChange={(e) => setComentario(e.target.value)}
          />
          <div className="linha" style={{ gap: 8, marginTop: 8 }}>
            <button className="botao" disabled={enviando || !comentario.trim()} onClick={() => responder("ajuste")}>
              {enviando ? "Enviando..." : "Enviar pedido de ajuste"}
            </button>
            <button className="botao sec" onClick={() => setAjustando(false)}>Voltar</button>
          </div>
        </div>
      ) : (
        <div className="aprovar-botoes">
          <button className="botao ok" disabled={enviando} onClick={() => responder("aprovado")}>✓ Aprovar</button>
          <button className="botao sec" disabled={enviando} onClick={() => setAjustando(true)}>✏️ Pedir ajuste</button>
        </div>
      )}
      {erro && <div className="erro-msg">{erro}</div>}
    </article>
  );
}
