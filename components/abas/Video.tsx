"use client";

import { useState } from "react";
import { custoEstimadoVideo, iniciarVideo } from "@/lib/servicos";
import { useStore } from "@/lib/store";
import { brl, formatarData } from "@/lib/util";
import { BotaoBaixar, CartaoMidia, MidiaPorId } from "../MidiaView";
import SeletorMidias from "../SeletorMidias";

export default function Video({ provedor }: { provedor: "veo" | "seedance" }) {
  const store = useStore();
  const { estado } = store;
  const nome = provedor === "veo" ? "Veo" : "Seedance";
  const [titulo, setTitulo] = useState("");
  const [prompt, setPrompt] = useState("");
  const [proporcao, setProporcao] = useState("9:16");
  const [duracao, setDuracao] = useState("");
  const [imagem, setImagem] = useState<string>();
  const [seletor, setSeletor] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string>();

  const custo = custoEstimadoVideo(estado.config, provedor) * estado.config.cambio;
  const videos = estado.midias.filter((m) => m.origem === provedor);

  async function gerar() {
    if (!prompt.trim()) return;
    if (estado.config.confirmarVideos && !window.confirm(`Gerar vídeo no ${nome}? Custo estimado: ${brl(custo)}.`)) return;
    setErro(undefined);
    setOcupado(true);
    try {
      await iniciarVideo(store, {
        provedor,
        prompt: prompt.trim(),
        titulo: titulo.trim() || prompt.trim().slice(0, 50),
        imagemId: imagem,
        proporcao,
        duracao: duracao || undefined,
      });
      setPrompt("");
      setTitulo("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="conteudo">
      <div className="cartao" style={{ maxWidth: 820, marginBottom: 24 }}>
        <h3>Novo vídeo no {nome}</h3>
        <p className="ajuda">
          {provedor === "veo"
            ? "Vídeos curtos (até 8 s) com áudio. É o mais barato: use como padrão."
            : "Mais caro, ótimo para cenas cinematográficas e pessoas realistas. Com imagem inicial, a proporção segue a da imagem."}{" "}
          O vídeo leva alguns minutos e aparece abaixo quando ficar pronto.
        </p>
        <div className="campo">
          <label>Título (para você se organizar)</label>
          <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Reels apresentação" />
        </div>
        <div className="campo">
          <label>Prompt</label>
          <textarea
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Descreva a cena, a ação, o movimento de câmera, a luz, o estilo e o áudio…"
          />
        </div>
        <div className="linha" style={{ marginBottom: 14 }}>
          <div>
            <label>Proporção</label>
            <select value={proporcao} onChange={(e) => setProporcao(e.target.value)} style={{ width: 140 }}>
              <option value="9:16">9:16 (reels/stories)</option>
              <option value="16:9">16:9 (horizontal)</option>
            </select>
          </div>
          {provedor === "seedance" && (
            <div>
              <label>Duração (segundos, opcional)</label>
              <input type="text" value={duracao} onChange={(e) => setDuracao(e.target.value)} placeholder="ex.: 5" style={{ width: 140 }} />
            </div>
          )}
          <div>
            <label>Imagem inicial (opcional)</label>
            <div className="linha">
              <button className="botao sec" onClick={() => setSeletor(true)}>
                {imagem ? "Trocar imagem" : "Escolher imagem"}
              </button>
              {imagem && (
                <button className="botao sec peq" onClick={() => setImagem(undefined)}>
                  Remover
                </button>
              )}
            </div>
          </div>
        </div>
        {imagem && (
          <div style={{ marginBottom: 14 }}>
            <MidiaPorId id={imagem} />
          </div>
        )}
        <div className="linha">
          <button className="botao" onClick={gerar} disabled={ocupado || !prompt.trim()}>
            {ocupado ? "Enviando…" : `Gerar vídeo (~${brl(custo)})`}
          </button>
        </div>
        {erro && <div className="erro-msg">{erro}</div>}
      </div>

      <h3>Vídeos do {nome}</h3>
      {videos.length === 0 ? (
        <p className="vazio">Nenhum vídeo ainda.</p>
      ) : (
        <div className="grade-midias" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {videos.map((m) => (
            <div key={m.id}>
              <CartaoMidia midia={m} acoes={<BotaoBaixar midia={m} />} />
              <p className="ajuda" style={{ margin: "4px 2px" }} title={m.prompt}>
                {formatarData(m.criadoEm)}
              </p>
            </div>
          ))}
        </div>
      )}

      {seletor && (
        <SeletorMidias
          multiplo={false}
          selecionadas={imagem ? [imagem] : []}
          aoConfirmar={(ids) => setImagem(ids[0])}
          aoFechar={() => setSeletor(false)}
        />
      )}
    </div>
  );
}
