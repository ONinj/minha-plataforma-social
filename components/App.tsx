"use client";

import { useEffect, useRef, useState } from "react";
import { verificarVideos } from "@/lib/servicos";
import { StoreProvider, totalContaMes, totalMes, useStore } from "@/lib/store";
import { formatarCreditos } from "@/lib/custo";
import { atualizarConexoes, sincronizarPublicacoes } from "@/lib/instagram";
import { sincronizarDecisoes } from "@/lib/aprovacaoCliente";
import { MODO_NUVEM, eventosNuvem, pediuNovaSenha } from "@/lib/nuvem";
import { brl } from "@/lib/util";
import Admin from "./abas/Admin";
import Plano from "./abas/Plano";
import { NovaSenha } from "./Login";
import PaginaVendas from "./PaginaVendas";
import Diagnostico from "./Diagnostico";
import Agendamentos from "./abas/Agendamentos";
import Aprovacoes from "./abas/Aprovacoes";
import Biblioteca from "./abas/Biblioteca";
import ClaudeDireto from "./abas/ClaudeDireto";
import Configuracoes from "./abas/Configuracoes";
import Gemini from "./abas/Gemini";
import Editor from "./abas/Editor";
import Gerente from "./abas/Gerente";
import Ideias from "./abas/Ideias";
import Inicio from "./abas/Inicio";
import Midias from "./abas/Midias";
import Perfis from "./abas/Perfis";
import Video from "./abas/Video";
import Logo from "./Logo";
import Icone, { Avatar } from "./Icone";
import ModalFormulario from "./ModalFormulario";

export type IdAba =
  | "inicio"
  | "central"
  | "claude"
  | "gemini"
  | "veo"
  | "seedance"
  | "editor"
  | "aprovacoes"
  | "agendamentos"
  | "midias"
  | "biblioteca"
  | "ideias"
  | "perfis"
  | "plano"
  | "admin"
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
      { id: "editor", nome: "Editor de vídeo", icone: "editar", descricao: "O Claude edita o seu vídeo gravado: corta, legenda e encaixa no planejamento" },
    ],
  },
  {
    titulo: "Organizar",
    abas: [
      { id: "aprovacoes", nome: "Aprovações", icone: "aprovar", descricao: "O que o gerente entregou esperando o seu OK" },
      { id: "agendamentos", nome: "Calendário", icone: "calendario", descricao: "O que está a programar, programado e postado" },
      { id: "midias", nome: "Mídias e envios", icone: "pasta", descricao: "Suas fotos e vídeos e tudo o que as IAs criaram" },
      { id: "biblioteca", nome: "Biblioteca", icone: "biblioteca", descricao: "Seus vídeos e fotos prontos, em pastas, para o gerente usar de referência" },
      { id: "ideias", nome: "Ideias e textos", icone: "ideia", descricao: "Banco de ideias, hashtags e legendas salvas" },
    ],
  },
  {
    titulo: "Conta",
    abas: [
      { id: "perfis", nome: "Perfis e redes", icone: "perfis", descricao: "Os perfis (clientes) desta conta e as redes conectadas" },
      { id: "plano", nome: "Plano e créditos", icone: "carteira", descricao: "Seu plano, saldo de créditos, recargas e extrato" },
      { id: "config", nome: "Configurações", icone: "config", descricao: "Modelos, confirmações e dados" },
      { id: "admin", nome: "Administração", icone: "estrela", descricao: "Contas, planos e créditos de todos os clientes" },
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

  // Acompanha os vídeos em produção (de todos os perfis) a cada 5 segundos.
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
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [gerando, conta.id]);

  // Avisa antes de fechar/recarregar a página enquanto o gerente está trabalhando.
  useEffect(() => {
    if (!store.ocupado) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [store.ocupado]);

  // Alerta de gasto com IA para o administrador (uma vez por visita).
  const alertaAdmin = store.nuvem?.alertaAdmin;
  useEffect(() => {
    if (alertaAdmin) store.avisar(alertaAdmin, "erro");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertaAdmin]);

  // Volta do login do Instagram (?instagram=ok|erro).
  useEffect(() => {
    if (!store.nuvem) return;
    const q = new URLSearchParams(window.location.search);
    const r = q.get("instagram");
    if (!r) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (r === "ok") {
      store.avisar(`Instagram @${q.get("usuario") ?? ""} conectado!`, "ok");
      const perfil = q.get("perfil");
      if (perfil && conta.marcas.some((m) => m.id === perfil)) store.trocarMarca(perfil);
      void atualizarConexoes();
    } else store.avisar(`Não foi possível conectar o Instagram: ${q.get("msg") ?? "erro"}`, "erro");
    setAba("perfis");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!store.nuvem]);

  // Atualiza a situação das publicações automáticas do perfil ativo (a cada minuto).
  const temPublicacaoPendente = estado.agendamentos.some(
    (a) => a.publicarAuto && a.publicacao && ["agendada", "publicando"].includes(a.publicacao.status),
  );
  useEffect(() => {
    if (!store.nuvem || !temPublicacaoPendente) return;
    const tick = () => sincronizarPublicacoes(storeRef.current).catch(() => {});
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [temPublicacaoPendente, marca.id, !!store.nuvem]);

  // Respostas dos clientes pelo link de aprovação (a cada minuto, só para perfis com peças aguardando).
  const temAguardando = estado.aprovacoes.some((a) => a.status === "pendente" || a.status === "ajuste");
  useEffect(() => {
    if (!store.nuvem || !temAguardando) return;
    const tick = () => sincronizarDecisoes(storeRef.current).catch(() => {});
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, [temAguardando, marca.id, !!store.nuvem]);

  // Mostra no título da aba do navegador quantos vídeos estão sendo feitos.
  const qtdGerando = conta.marcas.reduce((n, m) => n + m.midias.filter((x) => x.status === "gerando").length, 0);
  useEffect(() => {
    document.title = qtdGerando ? `⏳ ${qtdGerando} vídeo(s) em produção · Galhos` : "Galhos";
  }, [qtdGerando]);

  useEffect(() => {
    if (!MODO_NUVEM && carregado && !conta.config.chaveAnthropic && !conta.config.chaveFal) setAba("config");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregado]);

  if (MODO_NUVEM && carregado && store.sessao === "sem_login") return <PaginaVendas />;
  if (MODO_NUVEM && store.erroCarga && store.sessao !== "pronta") {
    return (
      <div className="tela-login">
        <div className="login-caixa">
          <h2 className="titulo-pagina">Não consegui abrir sua conta</h2>
          <p className="ajuda">O login funcionou, mas o servidor respondeu com este erro:</p>
          <div className="erro-msg">{store.erroCarga}</div>
          <p className="ajuda">Se você é o administrador, veja o que está faltando na configuração:</p>
          <Diagnostico />
          <div className="linha" style={{ justifyContent: "flex-end" }}>
            <button className="botao sec" onClick={() => store.sair()}>Sair</button>
            <button className="botao" onClick={() => window.location.reload()}>Tentar de novo</button>
          </div>
        </div>
      </div>
    );
  }
  if (!carregado || (MODO_NUVEM && store.sessao !== "pronta")) {
    return (
      <div className="vazio" style={{ paddingTop: "40vh" }}>
        <div className="girando" style={{ margin: "0 auto" }} />
      </div>
    );
  }

  const nuvem = store.nuvem;
  // Abas que dependem do plano (modo nuvem): mostram cadeado e um convite para mudar de plano.
  const travada = (id: IdAba) =>
    !!nuvem && ((id === "seedance" && !nuvem.recursos.seedance) || (id === "biblioteca" && !nuvem.recursos.biblioteca));
  const visivel = (id: IdAba) =>
    (id !== "plano" || MODO_NUVEM) && (id !== "admin" || !!nuvem?.usuario.admin);
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
          <Logo tamanho={30} />
          <div>
            Galhos
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
            {s.abas.filter((a) => visivel(a.id)).map((a) => (
              <button key={a.id} className={`aba ${aba === a.id ? "ativa" : ""}`} onClick={() => ir(a.id)}>
                <Icone nome={a.icone} />
                {a.nome}
                {a.id === "aprovacoes" && pendentes > 0 && <span className="contador">{pendentes}</span>}
                {travada(a.id) ? (
                  <span className="trava" title="Não incluído no seu plano">🔒</span>
                ) : (
                  a.cor && <span className="ponto-cor" style={{ background: a.cor }} />
                )}
              </button>
            ))}
          </div>
        ))}

        {nuvem ? (
          <button className="gasto" style={{ marginTop: 18, textAlign: "left", cursor: "pointer", color: "inherit" }} onClick={() => ir("plano")}>
            <div className="linha" style={{ gap: 6 }}>
              <Icone nome="carteira" tamanho={15} /> Créditos · plano {nuvem.plano.nome}
            </div>
            <strong>{formatarCreditos(nuvem.conta.saldo)}</strong>
            {nuvem.plano.creditos_mensais > 0 && (
              <div className={`barra ${nuvem.conta.saldo < nuvem.plano.creditos_mensais * 0.2 ? "alerta" : ""}`}>
                <div style={{ width: `${Math.min(100, (nuvem.conta.saldo / nuvem.plano.creditos_mensais) * 100)}%` }} />
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 11.5, color: nuvem.conta.status === "atrasado" ? "var(--erro)" : "var(--texto-3)" }}>
              {nuvem.conta.status === "atrasado"
                ? "Pagamento em aberto"
                : nuvem.conta.status === "teste"
                  ? "Teste grátis · escolha um plano"
                  : "Recarregar ou mudar de plano"}
            </div>
          </button>
        ) : (
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
        )}
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
            {store.tarefa && (
              <button className="etiqueta" style={{ cursor: "pointer", maxWidth: 360, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }} onClick={() => ir("biblioteca")} title={store.tarefa}>
                <span className="girando" style={{ width: 11, height: 11, borderWidth: 2 }} /> {store.tarefa}
              </button>
            )}
            <Notificacoes ir={ir} />
            {nuvem ? (
              <MenuUsuario ir={ir} />
            ) : (
              <button
                className="botao-icone"
                title={`${marca.nome}: trocar perfil`}
                onClick={() => setMenuAberto(true)}
                style={{ padding: 0, border: 0, background: "none" }}
              >
                <Avatar nome={marca.nome} cor={marca.cor} tamanho={34} />
              </button>
            )}
          </div>
        </header>

        {store.importavel && (
          <div className="cartao" style={{ margin: "14px 28px 0", borderColor: "rgba(139,92,246,.5)" }}>
            <div className="linha" style={{ justifyContent: "space-between" }}>
              <span>
                <b>Encontramos perfis salvos só neste navegador.</b>{" "}
                <span className="ajuda">Quer levar para a sua conta na nuvem? (conversas, mídias, aprovações e calendário)</span>
              </span>
              <span className="linha">
                <button className="botao sec peq" onClick={store.recusarImportacao}>Agora não</button>
                <button className="botao peq" onClick={store.importarLocal}>Importar para a nuvem</button>
              </span>
            </div>
          </div>
        )}
        <div className="area" key={`${raiz.contaAtiva}-${marca.id}`}>
          {travada(aba) && (
            <div className="conteudo">
              <div className="cartao" style={{ maxWidth: 620, margin: "8vh auto", textAlign: "center" }}>
                <div style={{ fontSize: 36 }}>🔒</div>
                <h2 className="titulo-pagina">{atual.nome} não está no seu plano</h2>
                <p className="ajuda">
                  {aba === "seedance"
                    ? "O Seedance faz os vídeos mais cinematográficos e pode animar a partir dos seus próprios vídeos. Ele vem a partir do plano Profissional."
                    : "A biblioteca guarda seus vídeos e fotos prontos para o gerente usar como referência. Ela vem a partir do plano Profissional."}
                </p>
                <button className="botao" onClick={() => ir("plano")}>Ver planos</button>
              </div>
            </div>
          )}
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
          {aba === "seedance" && !travada("seedance") && <Video key="seedance" provedor="seedance" />}
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
          {aba === "biblioteca" && !travada("biblioteca") && (
            <Biblioteca
              mandarParaCentral={(ids) => {
                setAnexosParaGerente(ids);
                ir("central");
              }}
            />
          )}
          {aba === "ideias" && <Ideias falarComGerente={falarComGerente} />}
          {aba === "perfis" && <Perfis falarComGerente={falarComGerente} />}
          {aba === "editor" && <Editor ir={ir} />}
          {aba === "config" && <Configuracoes />}
          {aba === "plano" && nuvem && <Plano />}
          {aba === "admin" && nuvem?.usuario.admin && <Admin />}
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
          {!MODO_NUVEM && <button
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
          </button>}
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

// Voltou pelo link de "Esqueci minha senha"? (lido antes de a URL ser limpa)
const PEDIU_NOVA_SENHA = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("nova-senha");

function MenuUsuario({ ir }: { ir: (a: IdAba) => void }) {
  const { nuvem, sair } = useStore();
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState<"" | "trocar" | "recuperacao">(PEDIU_NOVA_SENHA || pediuNovaSenha() ? "recuperacao" : "");
  useEffect(() => {
    if (PEDIU_NOVA_SENHA) window.history.replaceState(null, "", window.location.pathname);
    const aoRecuperar = () => setSenha("recuperacao");
    eventosNuvem?.addEventListener("recuperar-senha", aoRecuperar);
    return () => eventosNuvem?.removeEventListener("recuperar-senha", aoRecuperar);
  }, []);
  if (!nuvem) return null;
  return (
    <div style={{ position: "relative" }}>
      {senha && <NovaSenha recuperacao={senha === "recuperacao"} aoFechar={() => setSenha("")} />}
      <button className="botao-icone" style={{ padding: 0, border: 0, background: "none" }} onClick={() => setAberto((v) => !v)} aria-label="Sua conta">
        <Avatar nome={nuvem.usuario.email} cor="#6366f1" tamanho={34} />
      </button>
      {aberto && (
        <div className="menu-flutuante" style={{ left: "auto", right: 0, width: 260 }}>
          <div className="menu-item" style={{ cursor: "default" }}>
            <span>
              {nuvem.usuario.email}
              <span className="sub">Plano {nuvem.plano.nome}</span>
            </span>
          </div>
          <button className="menu-item" onClick={() => { ir("plano"); setAberto(false); }}>
            <Icone nome="carteira" /> Plano e créditos
          </button>
          <button className="menu-item" onClick={() => { setSenha("trocar"); setAberto(false); }}>
            <Icone nome="cadeado" /> Definir ou trocar senha
          </button>
          <button className="menu-item" onClick={() => sair()}>
            <Icone nome="sair" /> Sair
          </button>
        </div>
      )}
    </div>
  );
}
