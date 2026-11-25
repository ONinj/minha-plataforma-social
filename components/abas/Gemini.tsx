"use client";

import { useEffect, useRef, useState } from "react";
import { chamarGemini, gerarImagemFal, midiaParaInline, salvarImagensGemini } from "@/lib/servicos";
import { useStore } from "@/lib/store";
import type { MensagemGemini, ParteGemini } from "@/lib/tipos";
import Markdown from "../Markdown";
import { BotaoBaixar, CartaoMidia, MidiaPorId } from "../MidiaView";
import SeletorMidias from "../SeletorMidias";

const PROPORCOES = ["1:1", "4:5", "9:16", "16:9", "3:4"];

export default function Gemini() {
  const store = useStore();
  const { estado } = store;
  const [texto, setTexto] = useState("");
  const [modoImagem, setModoImagem] = useState(true);
  const [proporcao, setProporcao] = useState("4:5");
  const [referencias, setReferencias] = useState<string[]>([]);
  const [seletor, setSeletor] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string>();
  const fim = useRef<HTMLDivElement>(null);
  const viaFal = estado.config.provedorImagem === "fal";
  const gerandoImagem = viaFal || modoImagem;

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [estado.chatGemini.length, ocupado]);

  async function enviar() {
    const t = texto.trim();
    if (!t || ocupado) return;
    setTexto("");
    setErro(undefined);
    setOcupado(true);
    const partesUsuario: ParteGemini[] = [...referencias.map((id) => ({ midiaId: id })), { texto: t }];
    setReferencias([]);
    store.atualizar((e) => ({ ...e, chatGemini: [...e.chatGemini, { papel: "user", partes: partesUsuario }] }));

    try {
      if (viaFal) {
        // Sem anexos, usa a última imagem criada como base para ajustes ("deixe o fundo azul").
        let refs = partesUsuario.filter((p): p is { midiaId: string } => "midiaId" in p).map((p) => p.midiaId);
        if (!refs.length) {
          const anterior = [...store.obter().chatGemini].reverse().find((m) => m.papel === "model");
          const ultimaImagem = anterior?.partes.filter((p): p is { midiaId: string } => "midiaId" in p).pop();
          if (ultimaImagem && !/^\s*nova\b/i.test(t)) refs = [ultimaImagem.midiaId];
        }
        const { midias, texto: obs } = await gerarImagemFal(store, {
          prompt: t,
          proporcao,
          referencias: refs,
          titulo: t.slice(0, 50),
        });
        const partesModelo: ParteGemini[] = [];
        if (obs) partesModelo.push({ texto: obs });
        midias.forEach((m) => partesModelo.push({ midiaId: m.id }));
        store.atualizar((e) => ({ ...e, chatGemini: [...e.chatGemini, { papel: "model", partes: partesModelo }] }));
        return;
      }
      const config = store.obter().config;
      // Manda só as últimas mensagens para a requisição não ficar pesada.
      const historico = store.obter().chatGemini.slice(-8);
      const contents = [];
      for (const m of historico) {
        const parts = [];
        for (const p of m.partes) {
          if ("texto" in p) parts.push({ text: p.texto });
          else parts.push(await midiaParaInline(store, p.midiaId, 1024));
        }
        contents.push({ role: m.papel, parts });
      }
      const resposta = await chamarGemini(store, {
        model: modoImagem ? config.modeloGeminiImagem : config.modeloGeminiTexto,
        contents,
        generationConfig: modoImagem
          ? { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: proporcao } }
          : undefined,
      });
      const imagens = await salvarImagensGemini(store, resposta, { titulo: t.slice(0, 50), prompt: t });
      const partesModelo: ParteGemini[] = [];
      const textoResposta = resposta.map((p) => p.text ?? "").join("").trim();
      if (textoResposta) partesModelo.push({ texto: textoResposta });
      imagens.forEach((m) => partesModelo.push({ midiaId: m.id }));
      if (!partesModelo.length) partesModelo.push({ texto: "(o Gemini não devolveu nada)" });
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
          <div className="cartao" style={{ maxWidth: 720 }}>
            <h3>Imagens: criativos</h3>
            {viaFal ? (
              <p className="ajuda">
                Descreva a imagem e o <b>Nano Banana 2</b> (pelo fal.ai) cria cards, stories e imagens de referência,
                salvas em Mídias. Para ajustar, é só pedir a mudança na mensagem seguinte: ele edita a última imagem.
                Para começar uma imagem do zero, comece a mensagem com <b>“nova”</b> ou clique em Nova conversa. Você
                também pode anexar imagens da biblioteca como referência.
              </p>
            ) : (
              <p className="ajuda">
                Com <b>Modo imagem</b> ligado, o Gemini cria cards, stories e imagens de referência (salvas em Mídias).
                Você pode anexar imagens da biblioteca para ele manter o estilo ou editar. Desligado, é um chat de texto.
              </p>
            )}
          </div>
        )}
        {estado.chatGemini.map((m: MensagemGemini, i) => (
          <div key={i} className={`msg ${m.papel === "user" ? "usuario" : "ia"}`}>
            {m.partes.map((p, j) =>
              "texto" in p ? (
                m.papel === "user" ? (
                  <div key={j}>{p.texto}</div>
                ) : (
                  <Markdown key={j} texto={p.texto} />
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
        {ocupado && (
          <div className="etapa">
            <div className="girando" /> {viaFal ? "Nano Banana criando..." : "Gemini criando..."}
          </div>
        )}
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
      <div className="entrada" style={{ flexWrap: "wrap" }}>
        <div className="linha" style={{ width: "100%" }}>
          {!viaFal && (
            <label className="linha" style={{ margin: 0, cursor: "pointer" }}>
              <input type="checkbox" checked={modoImagem} onChange={(e) => setModoImagem(e.target.checked)} /> Modo imagem
            </label>
          )}
          {gerandoImagem && (
            <select value={proporcao} onChange={(e) => setProporcao(e.target.value)} style={{ width: "auto" }}>
              {PROPORCOES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          )}
          <button className="botao sec peq" onClick={() => setSeletor(true)}>
            📎 Anexar referência
          </button>
          {estado.chatGemini.length > 0 && (
            <button
              className="botao sec peq"
              onClick={() => store.atualizar((e) => ({ ...e, chatGemini: [] }))}
              style={{ marginLeft: "auto" }}
            >
              Nova conversa
            </button>
          )}
        </div>
        <textarea
          value={texto}
          style={{ flex: 1 }}
          placeholder={gerandoImagem ? "Descreva a imagem que você quer, ou o ajuste na última…" : "Converse com o Gemini…"}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
        />
        <button className="botao" onClick={enviar} disabled={ocupado || !texto.trim()}>
          Enviar
        </button>
      </div>
      {seletor && (
        <SeletorMidias selecionadas={referencias} aoConfirmar={setReferencias} aoFechar={() => setSeletor(false)} />
      )}
    </div>
  );
}

function ImagemResposta({ id }: { id: string }) {
  const { estado } = useStore();
  const midia = estado.midias.find((m) => m.id === id);
  if (!midia) return null;
  return (
    <div style={{ width: 280, margin: "8px 0" }}>
      <CartaoMidia midia={midia} acoes={<BotaoBaixar midia={midia} />} />
    </div>
  );
}
