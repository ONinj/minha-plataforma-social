"use client";

import { useEffect, useState } from "react";
import { verificarVideos } from "@/lib/servicos";
import { StoreProvider, useStore } from "@/lib/store";
import { brl, mesAtual } from "@/lib/util";
import Agendamentos from "./abas/Agendamentos";
import Aprovacoes from "./abas/Aprovacoes";
import ClaudeDireto from "./abas/ClaudeDireto";
import Configuracoes from "./abas/Configuracoes";
import Gemini from "./abas/Gemini";
import Gerente from "./abas/Gerente";
import Midias from "./abas/Midias";
import Video from "./abas/Video";

type IdAba = "central" | "claude" | "gemini" | "veo" | "seedance" | "aprovacoes" | "agendamentos" | "midias" | "config";

const ABAS: { id: IdAba; nome: string; cor: string; descricao: string }[] = [
  { id: "central", nome: "Central (Gerente)", cor: "var(--destaque)", descricao: "Fale com o Claude: ele coordena as imagens (Nano Banana), o Veo e o Seedance e entrega tudo pronto para aprovar." },
  { id: "claude", nome: "Claude", cor: "var(--claude)", descricao: "Conversa direta com o Claude, sem acionar as outras IAs." },
  { id: "gemini", nome: "Imagens", cor: "var(--gemini)", descricao: "Criativos com o Nano Banana 2: cards, stories e imagens de referência." },
  { id: "veo", nome: "Veo", cor: "var(--veo)", descricao: "Vídeos com o Veo 3.1 (Google)." },
  { id: "seedance", nome: "Seedance", cor: "var(--seedance)", descricao: "Vídeos com o Seedance (via fal.ai)." },
  { id: "aprovacoes", nome: "Aprovações", cor: "var(--alerta)", descricao: "Tudo o que o gerente entregou esperando o seu OK." },
  { id: "agendamentos", nome: "Agendamentos", cor: "var(--ok)", descricao: "O seu calendário: o que está a programar, programado e postado." },
  { id: "midias", nome: "Mídias e envios", cor: "var(--texto-2)", descricao: "Envie suas fotos e vídeos e veja tudo o que as IAs criaram." },
  { id: "config", nome: "Configurações", cor: "var(--texto-2)", descricao: "Chaves das IAs, perfil da marca, modelos e controle de gastos." },
];

export default function App() {
  return (
    <StoreProvider>
      <Plataforma />
    </StoreProvider>
  );
}

function Plataforma() {
  const store = useStore();
  const { estado, carregado } = store;
  const [aba, setAba] = useState<IdAba>("central");
  const [paraGerente, setParaGerente] = useState<string>();
  const [anexosParaGerente, setAnexosParaGerente] = useState<string[]>();

  const semChaves = !estado.config.chaveAnthropic && !estado.config.chaveGoogle && !estado.config.chaveFal;
  useEffect(() => {
    if (carregado && semChaves) setAba("config");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregado]);

  // Acompanha os vídeos em produção a cada 15 segundos.
  const gerando = estado.midias.some((m) => m.status === "gerando");
  useEffect(() => {
    if (!gerando) return;
    let rodando = false;
    const tick = async () => {
      if (rodando) return;
      rodando = true;
      await verificarVideos(store).finally(() => (rodando = false));
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, [gerando, store]);

  const g = estado.gastos[mesAtual()];
  const totalUsd = g ? g.claude + g.gemini + g.veo + g.seedance : 0;
  const pendentes = estado.aprovacoes.filter((a) => a.status === "pendente").length;
  const atual = ABAS.find((a) => a.id === aba)!;

  function falarComGerente(texto: string) {
    setParaGerente(texto);
    setAba("central");
  }

  if (!carregado) return <div className="vazio">Carregando…</div>;

  return (
    <div className="app">
      <nav className="lateral">
        <div className="marca">
          Central Social
          <small>Claude · Nano Banana · Veo · Seedance</small>
        </div>
        {ABAS.map((a, i) => (
          <div key={a.id} style={{ display: "contents" }}>
            {(i === 5 || i === 8) && <div className="separador" />}
            <button className={`aba ${aba === a.id ? "ativa" : ""}`} onClick={() => setAba(a.id)}>
              <span className="ponto" style={{ background: a.cor }} />
              {a.nome}
              {a.id === "aprovacoes" && pendentes > 0 && <span className="contador">{pendentes}</span>}
            </button>
          </div>
        ))}
        <div className="gasto" title={g ? `Claude ${brl(g.claude * estado.config.cambio)} · Imagens ${brl(g.gemini * estado.config.cambio)} · Veo ${brl(g.veo * estado.config.cambio)} · Seedance ${brl(g.seedance * estado.config.cambio)}` : ""}>
          Gasto estimado no mês
          <strong>{brl(totalUsd * estado.config.cambio)}</strong>
          {g && (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              Claude {brl(g.claude * estado.config.cambio)} · Imagens {brl(g.gemini * estado.config.cambio)}
              <br />
              Veo {brl(g.veo * estado.config.cambio)} · Seedance {brl(g.seedance * estado.config.cambio)}
            </div>
          )}
        </div>
      </nav>

      <main className="principal">
        <header className="cabecalho">
          <h1>{atual.nome}</h1>
          <p>{atual.descricao}</p>
        </header>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          {aba === "central" && (
            <Gerente
              pendente={paraGerente}
              anexosIniciais={anexosParaGerente}
              aoConsumir={() => setParaGerente(undefined)}
              aoConsumirAnexos={() => setAnexosParaGerente(undefined)}
            />
          )}
          {aba === "claude" && <ClaudeDireto />}
          {aba === "gemini" && <Gemini />}
          {aba === "veo" && <Video key="veo" provedor="veo" />}
          {aba === "seedance" && <Video key="seedance" provedor="seedance" />}
          {aba === "aprovacoes" && <Aprovacoes falarComGerente={falarComGerente} />}
          {aba === "agendamentos" && <Agendamentos />}
          {aba === "midias" && (
            <Midias
              mandarParaCentral={(ids) => {
                setAnexosParaGerente(ids);
                setAba("central");
              }}
            />
          )}
          {aba === "config" && <Configuracoes />}
        </div>
      </main>
    </div>
  );
}
