"use client";

import { useEffect, useRef, useState } from "react";
import { gerarImagemFal } from "@/lib/servicos";
import { useStore } from "@/lib/store";
import type { MensagemGemini, ParteGemini } from "@/lib/tipos";
import { brl } from "@/lib/util";
import { Etapa } from "../ChatClaudeView";
import Icone from "../Icone";
import Microfone from "../Microfone";
import { BotaoBaixar, CartaoMidia, MidiaPorId } from "../MidiaView";
import SeletorMidias from "../SeletorMidias";

const PROPORCOES = [
  { v: "4:5", nome: "4:5 · feed" },
  { v: "1:1", nome: "1:1 · quadrado" },
  { v: "9:16", nome: "9:16 · story/reels" },
  { v: "16:9", nome: "16:9 · horizontal" },
  { v: "3:4", nome: "3:4" },
];

const IDEIAS = [
  "Card de feed com uma xícara de café e bolo, fundo creme, texto 'Kits de Natal chegaram'",
  "Story com contagem regressiva para o lançamento, estilo minimalista",
  "Foto de produto em estúdio, luz suave, fundo verde-oliva",
];

export default function Gemini() {
  const store = useStore();
  const { estado } = store;
  const [texto, setTexto] = useState("");
  const [proporcao, setProporcao] = useState("4:5");
  const [referencias, setReferencias] = useState<string[]>([]);
  const [seletor, setSeletor] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string>();
  const fim = useRef<HTMLDivElement>(null);
  const custo = estado.config.precoImagem * estado.config.cambio;

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [estado.chatGemini.length, ocupado]);

  async function enviar(entrada?: string) {
    const t = (entrada ?? texto).trim();
    if (!t || ocupado) return;
    setTexto("");
    setErro(undefined);
    setOcupado(true);
    const partesUsuario: ParteGemini[] = [...referencias.map((id) => ({ midiaId: id })), { texto: t }];
    setReferencias([]);
    store.atualizar((e) => ({ ...e, chatGemini: [...e.chatGemini, { papel: "user", partes: partesUsuario }] }));

    try {
      // Sem anexos, usa a última imagem criada como base para ajustes ("deixe o fundo azul").
      let refs = partesUsuario.filter((p): p is { midiaId: string } => "midiaId" in p).map((p) => p.midiaId);
      if (!refs.length) {
        const anterior = [...store.obter().chatGemini].reverse().find((m) => m.papel === "model");
        const ultimaImagem = anterior?.partes.filter((p): p is { midiaId: string } => "midiaId" in p).pop();
        if (ultimaImagem && !/^\s*nova\b/i.test(t)) refs = [ultimaImagem.midiaId];
      }
      const { midias, texto: obs } = await gerarImagemFal(store, { prompt: t, proporcao, referencias: refs, titulo: t.slice(0, 50) });
      const partesModelo: ParteGemini[] = [];
      if (obs) partesModelo.push({ texto: obs });
      midias.forEach((m) => partesModelo.push({ midiaId: m.id }));
      store.atualizar((e) => ({ ...e, chatGemini: [...e.chatGemini, { papel: "model", partes: partesModelo }] }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      store.atualizar((e) => ({ ...e, chatGemini: e.chatGemini.slice(0, -1) }));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="chat">
      <div className="mensagens">
        {estado.chatGemini.length === 0 && (
          <div className="boas-vindas">
            <div className="orb">
              <Icone nome="imagem" tamanho={28} />
            </div>
            <h2 className="titulo-pagina">Crie imagens com o Nano Banana 2</h2>
            <p className="ajuda">
              Descreva a imagem. Para ajustar, peça a mudança na mensagem seguinte e ele edita a última imagem. Para
              começar do zero, comece com <b>“nova”</b>. Anexe fotos da biblioteca para manter o estilo ou o produto.
            </p>
            <div className="sugestoes">
              {IDEIAS.map((s) => (
                <button key={s} className="sugestao" onClick={() => enviar(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {estado.chatGemini.map((m: MensagemGemini, i) => (
          <div key={i} className={m.papel === "user" ? "msg usuario" : ""} style={m.papel === "model" ? { alignSelf: "flex-start" } : undefined}>
            {m.partes.map((p, j) =>
              "texto" in p ? (
                m.papel === "user" ? (
                  <div key={j}>{p.texto}</div>
                ) : (
                  <p key={j} className="ajuda">
                    {p.texto}
                  </p>
                )
              ) : m.papel === "user" ? (
                <div key={j} style={{ marginBottom: 6 }}>
                  <MidiaPorId id={p.midiaId} />
                </div>
              ) : (
                <ImagemResposta key={j} id={p.midiaId} />
              ),
            )}
          </div>
        ))}
        {ocupado && <Etapa texto="Nano Banana criando a imagem..." tipico="10 a 30s" />}
        {erro && <div className="erro-msg">{erro}</div>}
        <div ref={fim} />
      </div>

      {referencias.length > 0 && (
        <div className="anexos">
          {referencias.map((id) => (
            <MidiaPorId key={id} id={id} />
          ))}
          <button className="botao sec peq" onClick={() => setReferencias([])}>
            Remover anexos
          </button>
        </div>
      )}
      <div className="entrada" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <textarea
          value={texto}
          placeholder="Descreva a imagem que você quer, ou o ajuste na última…"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
        />
        <div className="linha" style={{ gap: 8 }}>
          <Microfone
            desativado={ocupado}
            aoParcial={(fala) => setTexto(fala)}
            aoFinal={(fala) => enviar(fala)}
          />
          <button className="botao sec peq" onClick={() => setSeletor(true)}>
            <Icone nome="clipe" tamanho={14} /> Referência
          </button>
          <select value={proporcao} onChange={(e) => setProporcao(e.target.value)} style={{ width: "auto", padding: "5px 10px" }}>
            {PROPORCOES.map((p) => (
              <option key={p.v} value={p.v}>
                {p.nome}
              </option>
            ))}
          </select>
          {estado.chatGemini.length > 0 && (
            <button className="botao sec peq" onClick={() => store.atualizar((e) => ({ ...e, chatGemini: [] }))}>
              Nova conversa
            </button>
          )}
          <span className="ajuda" style={{ marginLeft: "auto", fontSize: 12 }}>
            ~{brl(custo)} por imagem
          </span>
          <button className="botao" onClick={() => enviar()} disabled={ocupado || !texto.trim()}>
            <Icone nome="enviar" tamanho={15} /> Gerar
          </button>
        </div>
      </div>
      {seletor && <SeletorMidias selecionadas={referencias} aoConfirmar={setReferencias} aoFechar={() => setSeletor(false)} />}
    </div>
  );
}

function ImagemResposta({ id }: { id: string }) {
  const { estado } = useStore();
  const midia = estado.midias.find((m) => m.id === id);
  if (!midia) return null;
  return (
    <div style={{ width: 300, margin: "4px 0" }}>
      <CartaoMidia midia={midia} acoes={<BotaoBaixar midia={midia} />} />
    </div>
  );
}
