"use client";

import { useEffect, useRef, useState } from "react";
import { verificarVideos } from "@/lib/servicos";
import { StoreProvider, totalContaMes, totalMes, useStore } from "@/lib/store";
import { brl } from "@/lib/util";
import Agendamentos from "./abas/Agendamentos";
import Aprovacoes from "./abas/Aprovacoes";
import ClaudeDireto from "./abas/ClaudeDireto";
import Configuracoes from "./abas/Configuracoes";
import Gemini from "./abas/Gemini";
import Gerente from "./abas/Gerente";
import Ideias from "./abas/Ideias";
import Inicio from "./abas/Inicio";
import Midias from "./abas/Midias";
import Perfis from "./abas/Perfis";
import Video from "./abas/Video";
import Icone, { Avatar } from "./Icone";
import ModalFormulario from "./ModalFormulario";

export type IdAba =
  | "inicio"
  | "central"
  | "claude"
  | "gemini"
  | "veo"
  | "seedance"
  | "aprovacoes"
  | "agendamentos"
  | "midias"
  | "ideias"
  | "perfis"
  | "config";

type Aba = { id: IdAba; nome: string; icone: string; descricao: string; cor?: string };

const SECOES: { titulo?: string; abas: Aba[] }[] = [
  { abas: [{ id: "inicio", nome: "Início", icone: "inicio", descricao: "Resumo do perfil e atalhos do dia" }] },
  {
    titulo: "Criar",
    abas: [
      { id: "central", nome: "Central do gerente", icone: "central", descricao: "O Claude coordena imagens e vídeos e entrega tudo para aprovar" },
      { id: "claude", nome: "Claude", icone: "chat", descricao: "Conversa direta: ideias, roteiros, legendas", cor: "var(--claude)" },
      { id: "gemini", nome: "Imagens", icone: "imagem", descricao: "Nano Banana 2: cards, stories e referências", cor: "var(--gemini)" },
      { id: "veo", nome: "Veo", icone: "video", descricao: "Vídeos curtos com o Veo 3.1", cor: "var(--veo)" },
      { id: "seedance", nome: "Seedance", icone: "filme", descricao: "Vídeos cinematográficos com o Seedance", cor: "var(--seedance)" },
    ],
  },
  {
    titulo: "Organizar",
    abas: [
      { id: "aprovacoes", nome: "Aprovações", icone: "aprovar", descricao: "O que o gerente entregou esperando o seu OK" },
      { id: "agendamentos", nome: "Calendário", icone: "calendario", descricao: "O que está a programar, programado e postado" },
      { id: "midias", nome: "Mídias e envios", icone: "pasta", descricao: "Suas fotos e vídeos e tudo o que as IAs criaram" },
      { id: "ideias", nome: "Ideias e textos", icone: "ideia", descricao: "Banco de ideias, hashtags e legendas salvas" },
    ],
  },
  {
    titulo: "Conta",
    abas: [
      { id: "perfis", nome: "Perfis e redes", icone: "perfis", descricao: "Os perfis (clientes) desta conta e as redes conectadas" },
      { id: "config", nome: "Configurações", icone: "config", descricao: "Chaves das IAs, modelos e controle de gastos" },
    ],
  },
];
const TODAS = SECOES.flatMap((s) => s.abas);

export default function App() {
  return (
    <StoreProvider>
      <Plataforma />
    </StoreProvider>
  );
}

function Plataforma() {
  const store = useStore();
  const { estado, carregado, conta, marca, raiz } = store;
  const [aba, setAba] = useState<IdAba>("inicio");
  const [menuAberto, setMenuAberto] = useState(false);
  const [paraGerente, setParaGerente] = useState<string>();
  const [anexosParaGerente, setAnexosParaGerente] = useState<string[]>();

  // Acompanha os vídeos em produção (de todos os perfis) a cada 15 segundos.
  const storeRef = useRef(store);
  storeRef.current = store;
  const gerando = conta.marcas.some((m) => m.midias.some((x) => x.status === "gerando"));
  useEffect(() => {
    if (!gerando) return;
    let rodando = false;
    const tick = async () => {
      if (rodando) return;
      rodando = true;
      await verificarVideos(storeRef.current).finally(() => (rodando = false));
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, [gerando, conta.id]);

  useEffect(() => {
    if (carregado && !conta.config.chaveAnthropic && !conta.config.chaveFal) setAba("config");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregado]);

  if (!carregado) {
    return (
      <div className="vazio" style={{ paddingTop: "40vh" }}>
        <div className="girando" style={{ margin: "0 auto" }} />
      </div>
    );
  }

  const atual = TODAS.find((a) => a.id === aba)!;
  const pendentes = estado.aprovacoes.filter((a) => a.status === "pendente").length;
  const cambio = conta.config.cambio;
  const gastoConta = totalContaMes(conta) * cambio;
  const teto = conta.config.orcamentoMensal;

  function ir(id: IdAba) {
    setAba(id);
    setMenuAberto(false);
  }
  function falarComGerente(texto: string) {
    setParaGerente(texto);
    ir("central");
  }

  return (
    <div className="app">
      <div className={`fundo-celular ${menuAberto ? "aberto" : ""}`} onClick={() => setMenuAberto(false)} />
      <nav className={`lateral ${menuAberto ? "aberta" : ""}`}>
        <div className="logo">
          <span className="logo-marca">
            <Icone nome="raio" tamanho={16} />
          </span>
          <div>
            Central Social
            <small>Estúdio de conteúdo com IA</small>
          </div>
        </div>

        <SeletorConta />

        <div className="secao-titulo" style={{ display: "flex", alignItems: "center" }}>
          Perfis
          <span style={{ marginLeft: "auto", textTransform: "none", letterSpacing: 0 }}>{conta.marcas.length}</span>
        </div>
        <ListaPerfis aoCriar={() => ir("perfis")} />

        {SECOES.map((s, i) => (
          <div key={i} style={{ display: "contents" }}>
            {s.titulo && <div className="secao-titulo">{s.titulo}</div>}
            {s.abas.map((a) => (
              <button key={a.id} className={`aba ${aba === a.id ? "ativa" : ""}`} onClick={() => ir(a.id)}>
                <Icone nome={a.icone} />
                {a.nome}
                {a.id === "aprovacoes" && pendentes > 0 && <span className="contador">{pendentes}</span>}
                {a.cor && <span className="ponto-cor" style={{ background: a.cor }} />}
              </button>
            ))}
          </div>
        ))}

        <div className="gasto" style={{ marginTop: 18 }}>
          <div className="linha" style={{ gap: 6 }}>
            <Icone nome="carteira" tamanho={15} /> Gasto do mês · conta
          </div>
          <strong>{brl(gastoConta)}</strong>
          {teto > 0 && (
            <>
              <div className={`barra ${gastoConta >= teto * 0.8 ? "alerta" : ""}`}>
                <div style={{ width: `${Math.min(100, (gastoConta / teto) * 100)}%` }} />
              </div>
              <div style={{ marginTop: 6, fontSize: 11.5 }}>de {brl(teto)} de orçamento</div>
            </>
          )}
          <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--texto-3)" }}>
            Neste perfil: {brl(totalMes(marca.gastos) * cambio)}
          </div>
        </div>
      </nav>

      <main className="principal">
        <header className="topo">
          <button className="botao-icone so-celular" onClick={() => setMenuAberto(true)} aria-label="Abrir menu">
            <Icone nome="menu" />
          </button>
          <div style={{ minWidth: 0 }}>
            <div className="migalha">
              {conta.nome} <Icone nome="setaDir" tamanho={12} /> {marca.arroba ? `@${marca.arroba}` : marca.nome}
            </div>
            <h1>{atual.nome}</h1>
          </div>
          <div className="acoes">
            <Notificacoes ir={ir} />
            <button
              className="botao-icone"
              title={`${marca.nome}: trocar perfil`}
              onClick={() => setMenuAberto(true)}
              style={{ padding: 0, border: 0, background: "none" }}
            >
              <Avatar nome={marca.nome} cor={marca.cor} tamanho={34} />
            </button>
          </div>
        </header>

        <div className="area" key={`${raiz.contaAtiva}-${marca.id}`}>
          {aba === "inicio" && <Inicio ir={ir} falarComGerente={falarComGerente} />}
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
                ir("central");
              }}
            />
          )}
          {aba === "ideias" && <Ideias falarComGerente={falarComGerente} />}
          {aba === "perfis" && <Perfis />}
          {aba === "config" && <Configuracoes />}
        </div>
      </main>
      <Avisos />
    </div>
  );
}

function SeletorConta() {
  const { raiz, conta, trocarConta, criarConta, ocupado } = useStore();
  const [aberto, setAberto] = useState(false);
  const [nova, setNova] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        className="seletor"
        disabled={ocupado}
        title={ocupado ? "Espere o gerente terminar para trocar de conta" : "Trocar de conta"}
        onClick={() => setAberto((v) => !v)}
      >
        <Avatar nome={conta.nome} cor={conta.cor} tamanho={32} />
        <span className="textos">
          <b>{conta.nome}</b>
          <span className="sub">{conta.email || "sem e-mail"}</span>
        </span>
        <Icone nome="seta" tamanho={16} />
      </button>
      {aberto && (
        <div className="menu-flutuante">
          <div className="secao-titulo" style={{ paddingTop: 4 }}>
            Contas
          </div>
          {raiz.contas.map((c) => (
            <button
              key={c.id}
              className={`menu-item ${c.id === conta.id ? "ativo" : ""}`}
              onClick={() => {
                trocarConta(c.id);
                setAberto(false);
              }}
            >
              <Avatar nome={c.nome} cor={c.cor} tamanho={28} />
              <span style={{ flex: 1, minWidth: 0 }}>
                {c.nome}
                <span className="sub">
                  {c.email || "sem e-mail"} · {c.marcas.length} perfil(is)
                </span>
              </span>
              {c.id === conta.id && <Icone nome="check" tamanho={16} />}
            </button>
          ))}
          <button
            className="menu-item"
            onClick={() => {
              setAberto(false);
              setNova(true);
            }}
          >
            <span className="botao-icone" style={{ width: 28, height: 28 }}>
              <Icone nome="mais" tamanho={15} />
            </span>
            Adicionar conta
          </button>
        </div>
      )}
      {nova && (
        <ModalFormulario
          titulo="Nova conta"
          descricao="Uma conta é a pessoa ou a agência (ex.: o seu e-mail). Cada conta tem os próprios perfis, chaves e gastos."
          campos={[
            { nome: "nome", rotulo: "Nome", placeholder: "Ex.: Agência Rosa" },
            { nome: "email", rotulo: "E-mail", placeholder: "voce@gmail.com", tipo: "email" },
            { nome: "copiar", rotulo: "Usar as mesmas chaves das IAs da conta atual", tipo: "checkbox", padrao: "sim" },
          ]}
          aoSalvar={(v) => criarConta({ nome: v.nome || "Nova conta", email: v.email, copiarChaves: v.copiar === "sim" })}
          aoFechar={() => setNova(false)}
        />
      )}
    </div>
  );
}

function ListaPerfis({ aoCriar }: { aoCriar: () => void }) {
  const { conta, marca, trocarMarca, criarMarca, ocupado } = useStore();
  const [novo, setNovo] = useState(false);
  return (
    <div className="perfis-lista">
      {conta.marcas.map((m) => {
        const pend = m.aprovacoes.filter((a) => a.status === "pendente").length;
        return (
          <button
            key={m.id}
            className={`perfil-item ${m.id === marca.id ? "ativo" : ""}`}
            disabled={ocupado && m.id !== marca.id}
            title={ocupado ? "Espere o gerente terminar para trocar de perfil" : `Trocar para ${m.nome}`}
            onClick={() => trocarMarca(m.id)}
          >
            <Avatar nome={m.nome} cor={m.cor} tamanho={28} />
            <span className="textos">
              <b>{m.nome}</b>
              <span>{m.arroba ? `@${m.arroba}` : "sem @"}</span>
            </span>
            {pend > 0 && (
              <span className="etiqueta" style={{ color: "var(--alerta)", borderColor: "rgba(245,158,11,.4)" }}>
                {pend}
              </span>
            )}
          </button>
        );
      })}
      <button className="perfil-item" onClick={() => setNovo(true)} disabled={ocupado}>
        <span className="botao-icone" style={{ width: 28, height: 28 }}>
          <Icone nome="mais" tamanho={15} />
        </span>
        <span className="textos">
          <b>Novo perfil</b>
        </span>
      </button>
      {novo && (
        <ModalFormulario
          titulo="Novo perfil"
          descricao="Um perfil é uma marca ou cliente (ex.: a cafeteria, a loja, um influenciador). Cada perfil tem conversas, mídias, aprovações e calendário próprios."
          campos={[
            { nome: "nome", rotulo: "Nome do perfil", placeholder: "Ex.: Café Aconchego" },
            { nome: "arroba", rotulo: "@ do Instagram", placeholder: "cafeaconchego" },
          ]}
          aoSalvar={(v) => {
            criarMarca({ nome: v.nome || "Novo perfil", arroba: v.arroba });
            aoCriar();
          }}
          aoFechar={() => setNovo(false)}
        />
      )}
    </div>
  );
}

function Notificacoes({ ir }: { ir: (a: IdAba) => void }) {
  const { estado, conta } = useStore();
  const [aberto, setAberto] = useState(false);
  const pendentes = estado.aprovacoes.filter((a) => a.status === "pendente");
  const gerando = conta.marcas.flatMap((m) =>
    m.midias.filter((x) => x.status === "gerando").map((x) => ({ ...x, perfil: m.nome })),
  );
  const hoje = new Date().toISOString().slice(0, 10);
  const paraHoje = estado.agendamentos.filter(
    (a) => a.data.slice(0, 10) === hoje && a.status !== "postado" && a.status !== "cancelado",
  );
  const total = pendentes.length + gerando.length + paraHoje.length;
  return (
    <div style={{ position: "relative" }}>
      <button className="botao-icone" onClick={() => setAberto((v) => !v)} aria-label="Notificações">
        <Icone nome="sino" />
        {total > 0 && <span className="bolinha" />}
      </button>
      {aberto && (
        <div className="menu-flutuante" style={{ left: "auto", right: 0, width: 320 }}>
          {total === 0 && (
            <p className="vazio" style={{ padding: 20 }}>
              Tudo em dia por aqui ✨
            </p>
          )}
          {paraHoje.length > 0 && (
            <button
              className="menu-item"
              onClick={() => {
                ir("agendamentos");
                setAberto(false);
              }}
            >
              <Icone nome="calendario" /> <span>{paraHoje.length} publicação(ões) marcada(s) para hoje</span>
            </button>
          )}
          {pendentes.length > 0 && (
            <button
              className="menu-item"
              onClick={() => {
                ir("aprovacoes");
                setAberto(false);
              }}
            >
              <Icone nome="aprovar" /> <span>{pendentes.length} item(ns) esperando aprovação</span>
            </button>
          )}
          {gerando.map((m) => (
            <div key={m.id} className="menu-item">
              <div className="girando" />
              <span>
                {m.titulo}
                <span className="sub">
                  gerando no {m.origem === "veo" ? "Veo" : "Seedance"} · {m.perfil}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Avisos() {
  const { avisos, fecharAviso } = useStore();
  return (
    <div className="avisos">
      {avisos.map((a) => (
        <div key={a.id} className={`aviso ${a.tipo}`}>
          <span>{a.texto}</span>
          <button onClick={() => fecharAviso(a.id)} aria-label="Fechar">
            <Icone nome="x" tamanho={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
