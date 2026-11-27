"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, enviarArquivo } from "@/lib/nuvem";
import { useStore } from "@/lib/store";
import Icone from "./Icone";

export type MensagemSuporte = {
  id: number;
  autor: "cliente" | "equipe" | "nota" | "sistema";
  autor_email: string | null;
  texto: string;
  anexo_url: string | null;
  criado_em: string;
};
type Conversa = { id: string; assunto: string; status: string; nao_lidas_cliente: number; ultima_msg_em: string; ultima: string | null };

const NOME_STATUS: Record<string, string> = { aberta: "Aberta", aguardando: "Respondida", resolvida: "Resolvida" };

export function hora(iso: string) {
  const d = new Date(iso);
  const hoje = new Date().toDateString() === d.toDateString();
  return hoje
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Lista de mensagens de um chat (usada pelo cliente e pela equipe). */
export function Mensagens({ mensagens, lado }: { mensagens: MensagemSuporte[]; lado: "cliente" | "equipe" }) {
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length]);
  return (
    <div className="sup-mensagens">
      {mensagens.map((m) => {
        if (m.autor === "sistema") return <div key={m.id} className="sup-msg sistema">{m.texto} · {hora(m.criado_em)}</div>;
        const minha = lado === "cliente" ? m.autor === "cliente" : m.autor === "equipe";
        const classe = m.autor === "nota" ? "nota" : minha ? "minha" : "dele";
        const quem =
          m.autor === "nota" ? `Nota interna · ${m.autor_email ?? ""}` : m.autor === "equipe" ? (lado === "equipe" ? m.autor_email ?? "Equipe" : "Equipe Galhos") : lado === "equipe" ? m.autor_email ?? "Cliente" : "Você";
        return (
          <div key={m.id} className={`sup-msg ${classe}`}>
            {m.texto}
            {m.anexo_url && (
              <a href={m.anexo_url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.anexo_url} alt="Imagem anexada" />
              </a>
            )}
            <small>{quem} · {hora(m.criado_em)}</small>
          </div>
        );
      })}
      <div ref={fim} />
    </div>
  );
}

/** Botão de ajuda no topo + gaveta com as conversas do cliente com a equipe. */
export default function BotaoSuporte() {
  const store = useStore();
  const [aberto, setAberto] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  const [atual, setAtual] = useState<string | "nova" | null>(null);
  const [mensagens, setMensagens] = useState<MensagemSuporte[]>([]);
  const [statusAtual, setStatusAtual] = useState("");
  const [assunto, setAssunto] = useState("");
  const [texto, setTexto] = useState("");
  const [anexo, setAnexo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Contador de respostas novas da equipe (a cada minuto, ou a cada 10 s com o chat aberto).
  useEffect(() => {
    const ver = () => api<{ nao_lidas: number }>("/api/suporte?resumo=1").then((r) => setNaoLidas(r.nao_lidas)).catch(() => {});
    ver();
    const t = setInterval(ver, aberto ? 10000 : 60000);
    return () => clearInterval(t);
  }, [aberto]);

  const carregarLista = useCallback(() => {
    api<{ conversas: Conversa[] }>("/api/suporte").then((r) => setConversas(r.conversas)).catch(() => setConversas([]));
  }, []);
  const carregarConversa = useCallback((id: string) => {
    api<{ conversa: { status: string }; mensagens: MensagemSuporte[] }>(`/api/suporte?conversa=${id}`)
      .then((r) => {
        setMensagens((antes) => (antes.length === r.mensagens.length && antes.at(-1)?.id === r.mensagens.at(-1)?.id ? antes : r.mensagens));
        setStatusAtual(r.conversa.status);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!aberto) return;
    if (atual && atual !== "nova") {
      carregarConversa(atual);
      const t = setInterval(() => carregarConversa(atual), 10000);
      return () => clearInterval(t);
    }
    if (!atual) carregarLista();
  }, [aberto, atual, carregarConversa, carregarLista]);

  // Se não tem conversa nenhuma, abre direto o formulário de nova.
  useEffect(() => {
    if (aberto && !atual && conversas && conversas.length === 0) setAtual("nova");
  }, [aberto, atual, conversas]);

  async function enviar() {
    if (!texto.trim() || enviando) return;
    if (anexo && anexo.size > 8 * 1024 * 1024) return store.avisar("A imagem pode ter até 8 MB.", "erro");
    setEnviando(true);
    try {
      const caminho = anexo ? await enviarArquivo(`suporte-${Date.now()}.${anexo.type.split("/")[1] || "png"}`, anexo) : undefined;
      if (atual === "nova") {
        const r = await api<{ conversa: string }>("/api/suporte", { corpo: { acao: "nova", assunto, texto, anexo: caminho } });
        setAssunto("");
        setMensagens([]);
        setAtual(r.conversa);
      } else if (atual) {
        await api("/api/suporte", { corpo: { acao: "enviar", conversa: atual, texto, anexo: caminho } });
        carregarConversa(atual);
      }
      setTexto("");
      setAnexo(null);
    } catch (e) {
      store.avisar(String((e as Error).message), "erro");
    } finally {
      setEnviando(false);
    }
  }

  const escrever = (
    <div className="sup-escrever">
      {atual === "nova" && (
        <input type="text" placeholder="Assunto (ex.: dúvida sobre créditos)" value={assunto} maxLength={120} onChange={(e) => setAssunto(e.target.value)} />
      )}
      <textarea
        placeholder={atual === "nova" ? "Conte o que aconteceu ou o que você precisa…" : "Escreva sua mensagem…"}
        value={texto}
        maxLength={4000}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar();
        }}
      />
      <div className="linha" style={{ justifyContent: "space-between" }}>
        <label className="botao sec peq" style={{ cursor: "pointer" }} title="Anexar um print da tela">
          <Icone nome="clipe" tamanho={14} /> {anexo ? anexo.name.slice(0, 18) : "Print"}
          <input type="file" accept="image/*" hidden onChange={(e) => setAnexo(e.target.files?.[0] ?? null)} />
        </label>
        <button className="botao peq" disabled={!texto.trim() || enviando} onClick={enviar}>
          {enviando ? <span className="girando" /> : <Icone nome="enviar" tamanho={14} />} Enviar
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button className="botao-icone" onClick={() => { setAberto(true); setAtual(null); }} aria-label="Falar com o suporte" title="Ajuda e suporte">
        <Icone nome="chat" />
        {naoLidas > 0 && <span className="bolinha" />}
      </button>
      {aberto && createPortal(
        <>
          <div className="gaveta-fundo" onClick={() => setAberto(false)} />
          <aside className="gaveta" role="dialog" aria-label="Suporte">
            <div className="gaveta-topo">
              {atual && conversas && conversas.length > 0 && (
                <button className="botao-icone" onClick={() => setAtual(null)} aria-label="Voltar"><Icone nome="setaEsq" /></button>
              )}
              <h3>
                {atual === "nova" ? "Nova conversa" : atual ? conversas?.find((c) => c.id === atual)?.assunto ?? "Conversa" : "Fale com a equipe"}
              </h3>
              <button className="botao-icone" onClick={() => setAberto(false)} aria-label="Fechar"><Icone nome="x" /></button>
            </div>
            {!atual ? (
              <div className="gaveta-corpo">
                <p className="ajuda" style={{ marginTop: 0 }}>Respondemos em horário comercial, normalmente no mesmo dia. Você recebe a resposta aqui.</p>
                <button className="botao" style={{ width: "100%", marginBottom: 14 }} onClick={() => { setMensagens([]); setAtual("nova"); }}>
                  <Icone nome="mais" tamanho={15} /> Nova conversa
                </button>
                {!conversas ? <div className="girando" /> : conversas.map((c) => (
                  <button key={c.id} className="sup-item" onClick={() => { setMensagens([]); setAtual(c.id); }}>
                    <div className="linha" style={{ justifyContent: "space-between" }}>
                      <b style={{ fontSize: 14 }}>{c.assunto}</b>
                      {c.nao_lidas_cliente > 0 ? <span className="sup-contador">{c.nao_lidas_cliente}</span> : <span className="etiqueta">{NOME_STATUS[c.status]}</span>}
                    </div>
                    <div className="sup-previa">{c.ultima}</div>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="gaveta-corpo">
                  {atual === "nova" ? (
                    <p className="ajuda" style={{ marginTop: 0 }}>
                      Diga o que aconteceu, em qual tela e, se puder, anexe um print. Quanto mais detalhe, mais rápido a gente resolve.
                    </p>
                  ) : (
                    <>
                      <Mensagens mensagens={mensagens} lado="cliente" />
                      {statusAtual === "resolvida" && (
                        <p className="ajuda" style={{ textAlign: "center" }}>Esta conversa foi marcada como resolvida. Se precisar, é só escrever de novo.</p>
                      )}
                    </>
                  )}
                </div>
                {escrever}
              </>
            )}
          </aside>
        </>,
        document.body,
      )}
    </>
  );
}
