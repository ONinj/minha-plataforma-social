"use client";

import { useState } from "react";
import { chamarClaude } from "@/lib/servicos";
import { useStore } from "@/lib/store";
import type { Configuracoes as Config } from "@/lib/tipos";
import { MODO_NUVEM } from "@/lib/nuvem";
import Icone from "../Icone";
import { MetricoolProprio } from "../Metricool";

const ORDEM_ESFORCO = ["low", "medium", "high", "xhigh", "max"];

export default function Configuracoes() {
  const store = useStore();
  const { conta, raiz } = store;
  const r = store.nuvem?.recursos;
  // No modo nuvem, opções fora do plano aparecem com cadeado e ficam desativadas.
  const op = (lista: "claude" | "imagem" | "veo", valor: string, nome: string) => {
    const ok = !r || r[lista].includes(valor);
    return (
      <option key={valor} value={valor} disabled={!ok}>
        {ok ? nome : `🔒 ${nome} (outro plano)`}
      </option>
    );
  };
  const c = conta.config;
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
      const r = await chamarClaude(store, { messages: [{ role: "user", content: "Responda só: OK" }], effort: "low" });
      const texto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      setMensagem(`Claude funcionando (${r.model}): ${texto.trim()}`);
    } catch (e) {
      setMensagem(undefined);
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  function exportar() {
    const semChaves = {
      ...raiz,
      contas: raiz.contas.map((x) => ({ ...x, config: { ...x.config, chaveAnthropic: "", chaveFal: "" } })),
    };
    const blob = new Blob([JSON.stringify(semChaves, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `backup-central-social-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  return (
    <div className="conteudo" style={{ maxWidth: 900 }}>
      <p className="ajuda" style={{ marginTop: 0 }}>
        Estas configurações valem para todos os perfis da conta <b>{conta.nome}</b>.
        {MODO_NUVEM && " As chaves das IAs ficam no servidor: você só usa os créditos do seu plano."}
      </p>

      {!MODO_NUVEM && <div className="cartao" style={{ marginBottom: 18 }}>
        <h3>
          <Icone nome="raio" /> Chaves das IAs
        </h3>
        <p className="ajuda" style={{ marginTop: -4 }}>
          Ficam salvas só neste navegador e vão apenas para as próprias APIs. Não use em computador compartilhado.
        </p>
        <div className="campo">
          <label>Anthropic (Claude): console.anthropic.com → API Keys</label>
          <input type={mostrar ? "text" : "password"} value={c.chaveAnthropic} onChange={(e) => mudar("chaveAnthropic", e.target.value.trim())} placeholder="sk-ant-..." />
        </div>
        <div className="campo">
          <label>fal.ai (imagens Nano Banana 2, Veo e Seedance): fal.ai → Keys</label>
          <input type={mostrar ? "text" : "password"} value={c.chaveFal} onChange={(e) => mudar("chaveFal", e.target.value.trim())} placeholder="chave do fal.ai" />
        </div>
        <div className="linha">
          <label className="linha" style={{ margin: 0, cursor: "pointer" }}>
            <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} /> Mostrar chaves
          </label>
          <button className="botao sec" onClick={testarClaude} disabled={!c.chaveAnthropic}>
            Testar Claude
          </button>
        </div>
        {mensagem && <p className="ajuda" style={{ color: "var(--ok)" }}>{mensagem}</p>}
        {erro && <div className="erro-msg">{erro}</div>}
      </div>}

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h3>
          <Icone nome="central" /> Modelos
        </h3>
        <div className="grade-2">
          <div className="campo">
            <label>Claude (gerente e chat)</label>
            <select value={c.modeloClaude} onChange={(e) => mudar("modeloClaude", e.target.value)}>
              {op("claude", "claude-opus-5-5", "Claude Opus 5.5 (melhor qualidade)")}
              {op("claude", "claude-sonnet-5-5", "Claude Sonnet 5.5 (metade do preço)")}
              {op("claude", "claude-haiku-5-5", "Claude Haiku 5.5 (bem barato, mais simples)")}
            </select>
          </div>
          <div className="campo">
            <label>Esforço do gerente</label>
            <select value={c.esforcoGerente} onChange={(e) => mudar("esforcoGerente", e.target.value as Config["esforcoGerente"])}>
              <option value="low">Baixo (mais rápido e barato)</option>
              <option value="medium">Médio (recomendado)</option>
              {(
                [
                  ["high", "Alto (planejamentos mais caprichados)", "Profissional"],
                  ["max", "Máximo (o mais completo, mais lento)", "Premium"],
                ] as const
              ).map(([v, nome, plano]) => {
                const ok = !r || ORDEM_ESFORCO.indexOf(v) <= ORDEM_ESFORCO.indexOf(r.esforco_max);
                return (
                  <option key={v} value={v} disabled={!ok}>
                    {ok ? nome : `🔒 ${nome.split(" (")[0]} (plano ${plano})`}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="campo">
            <label>Imagens</label>
            <select value={c.modeloImagemFal} onChange={(e) => mudar("modeloImagemFal", e.target.value)}>
              {op("imagem", "fal-ai/nano-banana-2", "Nano Banana 2 (recomendado)")}
              {op("imagem", "fal-ai/nano-banana-pro", "Nano Banana Pro (melhor, mais caro)")}
              {op("imagem", "fal-ai/nano-banana", "Nano Banana (mais barato)")}
            </select>
          </div>
          <div className="campo">
            <label>Veo</label>
            <select value={c.modeloVeoFal} onChange={(e) => mudar("modeloVeoFal", e.target.value)}>
              {op("veo", "fal-ai/veo3.1/fast", "Veo 3.1 Fast (recomendado)")}
              {op("veo", "fal-ai/veo3.1/lite", "Veo 3.1 Lite (mais barato)")}
              {op("veo", "fal-ai/veo3.1", "Veo 3.1 (melhor, mais caro)")}
            </select>
          </div>
          {!MODO_NUVEM && <div className="campo">
            <label>Seedance (endereço no fal.ai)</label>
            <input type="text" value={c.prefixoSeedance} onChange={(e) => mudar("prefixoSeedance", e.target.value)} />
          </div>}
          <div className="campo">
            <label>Resolução do Seedance</label>
            <select value={c.resolucaoSeedance} onChange={(e) => mudar("resolucaoSeedance", e.target.value)}>
              {(
                [
                  ["480p", "480p (mais barato)"],
                  ["720p", "720p"],
                  ["1080p", "1080p (mais caro)"],
                ] as const
              ).map(([v, nome]) => {
                const ok = !r?.seedance_resolucoes || r.seedance_resolucoes.includes(v);
                return (
                  <option key={v} value={v} disabled={!ok}>
                    {ok ? nome : `🔒 ${v} (outro plano)`}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h3>
          <Icone nome="carteira" /> Controle de gastos
        </h3>
        <label className="linha" style={{ marginBottom: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={c.confirmarVideos} onChange={(e) => mudar("confirmarVideos", e.target.checked)} />
          Pedir minha confirmação antes de gerar qualquer vídeo
        </label>
        {!MODO_NUVEM && <div className="grade-2">
          <NumeroCampo rotulo="Orçamento mensal da conta (R$, 0 = sem limite)" valor={c.orcamentoMensal} aoMudar={(v) => mudar("orcamentoMensal", v)} passo="10" />
          <NumeroCampo rotulo="Câmbio (R$ por US$, com IOF)" valor={c.cambio} aoMudar={(v) => mudar("cambio", v)} />
          <NumeroCampo rotulo="Imagem (US$ por imagem)" valor={c.precoImagem} aoMudar={(v) => mudar("precoImagem", v)} />
          <NumeroCampo rotulo="Veo (US$ por segundo)" valor={c.precoVeoSegundo} aoMudar={(v) => mudar("precoVeoSegundo", v)} />
          <NumeroCampo rotulo="Duração média Veo (s)" valor={c.segundosVeo} aoMudar={(v) => mudar("segundosVeo", v)} />
          <NumeroCampo rotulo="Seedance (US$ por segundo)" valor={c.precoSeedanceSegundo} aoMudar={(v) => mudar("precoSeedanceSegundo", v)} />
          <NumeroCampo rotulo="Duração média Seedance (s)" valor={c.segundosSeedance} aoMudar={(v) => mudar("segundosSeedance", v)} />
        </div>}
        <p className="ajuda">
          {MODO_NUVEM
            ? "O uso das IAs é descontado do seu saldo de créditos (veja o extrato em Plano e créditos). Antes de cada vídeo você vê quantos créditos ele vai usar."
            : "O orçamento avisa quando você chega a 80% e a 100% do mês. Os preços são estimativas: confira os valores reais nos painéis da Anthropic e do fal.ai."}
        </p>
      </div>

      {MODO_NUVEM && <MetricoolProprio />}

      <div className="cartao">
        <h3>
          <Icone nome="pasta" /> Dados
        </h3>
        <p className="ajuda" style={{ marginTop: -4 }}>
          {MODO_NUVEM
            ? "Tudo fica salvo na nuvem e aparece em qualquer aparelho em que você entrar. O backup é uma cópia extra (sem os arquivos de imagem/vídeo)."
            : "Tudo fica salvo neste navegador. Baixe um backup de vez em quando (leva contas, perfis, textos, aprovações e calendário, mas não os arquivos de imagem/vídeo nem as chaves)."}
        </p>
        <div className="linha">
          <button className="botao sec" onClick={exportar}>
            <Icone nome="baixar" tamanho={15} /> Baixar backup
          </button>
          <button
            className="botao perigo"
            onClick={() => {
              if (window.confirm("Limpar a conversa da Central deste perfil? (mídias, aprovações e calendário continuam)"))
                store.atualizar((e) => ({ ...e, chatGerente: [] }));
            }}
          >
            Limpar conversa da Central
          </button>
          <button
            className="botao perigo"
            onClick={() => {
              if (window.confirm("Limpar a conversa do Claude deste perfil?")) store.atualizar((e) => ({ ...e, chatClaude: [] }));
            }}
          >
            Limpar conversa do Claude
          </button>
        </div>
      </div>
    </div>
  );
}

function NumeroCampo({ rotulo, valor, aoMudar, passo = "0.01" }: { rotulo: string; valor: number; aoMudar: (v: number) => void; passo?: string }) {
  return (
    <div className="campo">
      <label>{rotulo}</label>
      <input type="number" step={passo} value={valor} onChange={(e) => aoMudar(Number(e.target.value) || 0)} />
    </div>
  );
}
