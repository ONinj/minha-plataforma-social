"use client";

import { useState } from "react";
import { chamarClaude, listarModelosGoogle } from "@/lib/servicos";
import { useStore } from "@/lib/store";
import type { Configuracoes as Config } from "@/lib/tipos";

type ModeloGoogle = { id: string; nome: string; metodos: string[] };

/** Escolhe automaticamente o modelo mais recente de cada tipo na lista do Google. */
function sugerir(modelos: ModeloGoogle[]) {
  const gera = (m: ModeloGoogle) => m.metodos.includes("generateContent");
  const ordenar = (lista: ModeloGoogle[]) => [...lista].sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
  const imagem = ordenar(modelos.filter((m) => gera(m) && /image|banana/.test(m.id) && !/imagen/.test(m.id)));
  const video = ordenar(modelos.filter((m) => m.metodos.includes("predictLongRunning") && /veo/.test(m.id)));
  const texto = ordenar(
    modelos.filter((m) => gera(m) && /^gemini/.test(m.id) && /flash/.test(m.id) && !/image|banana|tts|live|audio|lite|embed/.test(m.id)),
  );
  return {
    imagem: imagem[0]?.id,
    video: (video.find((m) => /fast/.test(m.id)) ?? video[0])?.id,
    texto: (texto.find((m) => /latest/.test(m.id)) ?? texto[0])?.id,
  };
}

export default function Configuracoes() {
  const store = useStore();
  const c = store.estado.config;
  const [modelos, setModelos] = useState<ModeloGoogle[]>([]);
  const [mensagem, setMensagem] = useState<string>();
  const [erro, setErro] = useState<string>();
  const [mostrar, setMostrar] = useState(false);

  function mudar<K extends keyof Config>(chave: K, valor: Config[K]) {
    store.atualizar((e) => ({ ...e, config: { ...e.config, [chave]: valor } }));
  }

  async function testarClaude() {
    setErro(undefined);
    setMensagem("Testando o Claude...");
    try {
      const r = await chamarClaude(store, {
        messages: [{ role: "user", content: "Responda só: OK" }],
        effort: "low",
      });
      const texto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      setMensagem(`Claude funcionando (${r.model}): ${texto.trim()}`);
    } catch (e) {
      setMensagem(undefined);
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function carregarModelos() {
    setErro(undefined);
    setMensagem("Buscando modelos do Google...");
    try {
      const { modelos } = await listarModelosGoogle(store.obter().config);
      setModelos(modelos);
      const s = sugerir(modelos);
      store.atualizar((e) => ({
        ...e,
        config: {
          ...e.config,
          modeloGeminiImagem: s.imagem ?? e.config.modeloGeminiImagem,
          modeloVeo: s.video ?? e.config.modeloVeo,
          modeloGeminiTexto: s.texto ?? e.config.modeloGeminiTexto,
        },
      }));
      setMensagem(`Chave do Google funcionando: ${modelos.length} modelos. Escolhi os mais recentes abaixo; ajuste se quiser.`);
    } catch (e) {
      setMensagem(undefined);
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  function exportar() {
    const { config, ...dados } = store.obter();
    const semChaves = { ...config, chaveAnthropic: "", chaveGoogle: "", chaveFal: "" };
    const blob = new Blob([JSON.stringify({ ...dados, config: semChaves }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `backup-plataforma-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  const listaGoogle = (filtro: (m: ModeloGoogle) => boolean) =>
    modelos.filter(filtro).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>);

  return (
    <div className="conteudo" style={{ maxWidth: 860 }}>
      <div className="cartao" style={{ marginBottom: 18 }}>
        <h3>Chaves das IAs</h3>
        <p className="ajuda">
          As chaves ficam salvas só neste navegador e são enviadas apenas para as próprias APIs. Não use esta plataforma
          em computador compartilhado.
        </p>
        <div className="campo">
          <label>Anthropic (Claude) — console.anthropic.com → API Keys</label>
          <input type={mostrar ? "text" : "password"} value={c.chaveAnthropic} onChange={(e) => mudar("chaveAnthropic", e.target.value.trim())} placeholder="sk-ant-..." />
        </div>
        <div className="campo">
          <label>Google AI Studio (Gemini + Veo) — aistudio.google.com → Get API key</label>
          <input type={mostrar ? "text" : "password"} value={c.chaveGoogle} onChange={(e) => mudar("chaveGoogle", e.target.value.trim())} placeholder="AIza..." />
        </div>
        <div className="campo">
          <label>fal.ai (Seedance) — fal.ai → Keys</label>
          <input type={mostrar ? "text" : "password"} value={c.chaveFal} onChange={(e) => mudar("chaveFal", e.target.value.trim())} />
        </div>
        <div className="linha">
          <label className="linha" style={{ margin: 0 }}>
            <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} /> Mostrar chaves
          </label>
          <button className="botao sec" onClick={testarClaude} disabled={!c.chaveAnthropic}>
            Testar Claude
          </button>
          <button className="botao sec" onClick={carregarModelos} disabled={!c.chaveGoogle}>
            Testar Google e escolher modelos
          </button>
        </div>
        {mensagem && <p className="ajuda" style={{ color: "var(--ok)" }}>{mensagem}</p>}
        {erro && <div className="erro-msg">{erro}</div>}
      </div>

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h3>Perfil da marca</h3>
        <p className="ajuda">O gerente usa isto em todas as conversas: nicho, público, tom de voz, cores, redes, frequência.</p>
        <textarea
          rows={6}
          value={c.perfilMarca}
          onChange={(e) => mudar("perfilMarca", e.target.value)}
          placeholder="Ex.: Perfil @meuperfil sobre ... Público: ... Tom: descontraído ... Cores: preto e dourado ... Postar 3x por semana no Instagram e TikTok."
        />
      </div>

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h3>Modelos</h3>
        <div className="grade-2">
          <div className="campo">
            <label>Claude</label>
            <select value={c.modeloClaude} onChange={(e) => mudar("modeloClaude", e.target.value)}>
              <option value="claude-opus-5-5">Claude Opus 5.5 (melhor qualidade)</option>
              <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (metade do preço)</option>
              <option value="claude-haiku-5-5">Claude Haiku 5.5 (bem barato, mais simples)</option>
            </select>
          </div>
          <div className="campo">
            <label>Esforço do gerente</label>
            <select value={c.esforcoGerente} onChange={(e) => mudar("esforcoGerente", e.target.value as Config["esforcoGerente"])}>
              <option value="low">Baixo (mais rápido e barato)</option>
              <option value="medium">Médio (recomendado)</option>
              <option value="high">Alto (planejamentos mais caprichados)</option>
            </select>
          </div>
          <div className="campo">
            <label>Gemini — texto</label>
            <input type="text" list="m-texto" value={c.modeloGeminiTexto} onChange={(e) => mudar("modeloGeminiTexto", e.target.value)} />
            <datalist id="m-texto">{listaGoogle((m) => m.metodos.includes("generateContent"))}</datalist>
          </div>
          <div className="campo">
            <label>Gemini — imagem</label>
            <input type="text" list="m-imagem" value={c.modeloGeminiImagem} onChange={(e) => mudar("modeloGeminiImagem", e.target.value)} />
            <datalist id="m-imagem">{listaGoogle((m) => m.metodos.includes("generateContent"))}</datalist>
          </div>
          <div className="campo">
            <label>Veo</label>
            <input type="text" list="m-veo" value={c.modeloVeo} onChange={(e) => mudar("modeloVeo", e.target.value)} />
            <datalist id="m-veo">{listaGoogle((m) => m.metodos.includes("predictLongRunning"))}</datalist>
          </div>
          <div className="campo">
            <label>Seedance (endereço no fal.ai)</label>
            <input type="text" value={c.prefixoSeedance} onChange={(e) => mudar("prefixoSeedance", e.target.value)} />
          </div>
          <div className="campo">
            <label>Resolução do Seedance</label>
            <select value={c.resolucaoSeedance} onChange={(e) => mudar("resolucaoSeedance", e.target.value)}>
              <option value="480p">480p (mais barato)</option>
              <option value="720p">720p</option>
              <option value="1080p">1080p (mais caro)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h3>Controle de gastos</h3>
        <label className="linha" style={{ marginBottom: 14 }}>
          <input type="checkbox" checked={c.confirmarVideos} onChange={(e) => mudar("confirmarVideos", e.target.checked)} />
          Pedir minha confirmação antes de gerar qualquer vídeo
        </label>
        <p className="ajuda">
          Valores usados para estimar o gasto do mês (em dólar). Confira os preços atuais nos sites das empresas.
        </p>
        <div className="grade-2">
          <NumeroCampo rotulo="Câmbio (R$ por US$, com IOF)" valor={c.cambio} aoMudar={(v) => mudar("cambio", v)} />
          <NumeroCampo rotulo="Imagem Gemini (US$ por imagem)" valor={c.precoImagem} aoMudar={(v) => mudar("precoImagem", v)} />
          <NumeroCampo rotulo="Veo (US$ por segundo)" valor={c.precoVeoSegundo} aoMudar={(v) => mudar("precoVeoSegundo", v)} />
          <NumeroCampo rotulo="Duração média Veo (s)" valor={c.segundosVeo} aoMudar={(v) => mudar("segundosVeo", v)} />
          <NumeroCampo rotulo="Seedance (US$ por segundo)" valor={c.precoSeedanceSegundo} aoMudar={(v) => mudar("precoSeedanceSegundo", v)} />
          <NumeroCampo rotulo="Duração média Seedance (s)" valor={c.segundosSeedance} aoMudar={(v) => mudar("segundosSeedance", v)} />
        </div>
      </div>

      <div className="cartao">
        <h3>Dados</h3>
        <p className="ajuda">
          Tudo fica salvo neste navegador. Faça backup de vez em quando (o backup leva textos, agendamentos e
          aprovações, mas não os arquivos de imagem/vídeo nem as chaves).
        </p>
        <div className="linha">
          <button className="botao sec" onClick={exportar}>
            Baixar backup
          </button>
          <button
            className="botao perigo"
            onClick={() => {
              if (window.confirm("Limpar a conversa da Central? (as mídias, aprovações e agendamentos continuam)"))
                store.atualizar((e) => ({ ...e, chatGerente: [] }));
            }}
          >
            Limpar conversa da Central
          </button>
          <button
            className="botao perigo"
            onClick={() => {
              if (window.confirm("Limpar a conversa do Claude direto?")) store.atualizar((e) => ({ ...e, chatClaude: [] }));
            }}
          >
            Limpar conversa do Claude
          </button>
        </div>
      </div>
    </div>
  );
}

function NumeroCampo({ rotulo, valor, aoMudar }: { rotulo: string; valor: number; aoMudar: (v: number) => void }) {
  return (
    <div className="campo">
      <label>{rotulo}</label>
      <input type="number" step="0.01" value={valor} onChange={(e) => aoMudar(Number(e.target.value) || 0)} />
    </div>
  );
}
