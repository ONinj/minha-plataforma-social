"use client";

import { useCallback, useEffect, useState } from "react";
import { formatarCreditos } from "@/lib/custo";
import { api } from "@/lib/nuvem";
import { useStore } from "@/lib/store";
import Icone from "../Icone";
import { Mensagens, hora, type MensagemSuporte } from "../Suporte";

type Tag = { id: string; nome: string; cor: string };
type Resposta = { id: string; titulo: string; texto: string };
type Item = {
  id: string; assunto: string; status: string; prioridade: string; responsavel: string | null; tags: string[]; email: string | null;
  nao_lidas_equipe: number; ultima_msg_em: string; conta: string; plano_id: string; ultima: string | null; ultimo_autor: string | null;
};
type Detalhe = {
  conversa: Item & { conta_id: string; criado_em: string };
  mensagens: MensagemSuporte[];
  conta: { nome: string; plano: string; status: string; saldo: string; perfis: number; uso_mes: string; emails: string | null; criado_em: string; renova_em: string | null } | null;
  outras: { id: string; assunto: string; status: string; ultima_msg_em: string }[];
};

const STATUS = [["aberta", "Abertas"], ["aguardando", "Aguardando cliente"], ["resolvida", "Resolvidas"]] as const;
const PRIORIDADES = [["urgente", "🔴 Urgente"], ["alta", "🟠 Alta"], ["normal", "Normal"], ["baixa", "Baixa"]] as const;

function EtiquetaTag({ tag, desligada, onClick }: { tag: Tag; desligada?: boolean; onClick?: () => void }) {
  return (
    <span
      className={`sup-tag ${desligada ? "desligada" : ""}`}
      style={{ color: tag.cor, borderColor: tag.cor, background: desligada ? "none" : `${tag.cor}1f`, cursor: onClick ? "pointer" : undefined }}
      onClick={onClick}
    >
      {tag.nome}
    </span>
  );
}

/** Caixa de entrada do suporte, para a equipe da plataforma. */
export default function Suporte() {
  const store = useStore();
  const [config, setConfig] = useState<{ tags: Tag[]; respostas: Resposta[]; equipe: string[]; voce: string } | null>(null);
  const [lista, setLista] = useState<{ conversas: Item[]; contagem: Record<string, number> } | null>(null);
  const [filtro, setFiltro] = useState<{ status: string; tag: string; busca: string; minhas: boolean }>({ status: "aberta", tag: "", busca: "", minhas: false });
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [atual, setAtual] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [texto, setTexto] = useState("");
  const [modoNota, setModoNota] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [verInfo, setVerInfo] = useState(false);
  const [gerenciar, setGerenciar] = useState(false);
  const [erro, setErro] = useState("");

  const carregarConfig = useCallback(() => {
    api<typeof config>("/api/admin/suporte?config=1").then(setConfig).catch((e) => setErro(String(e.message)));
  }, []);
  const carregarLista = useCallback(() => {
    const q = new URLSearchParams();
    if (filtro.status) q.set("status", filtro.status);
    if (filtro.tag) q.set("tag", filtro.tag);
    if (filtro.busca) q.set("busca", filtro.busca);
    if (filtro.minhas) q.set("minhas", "1");
    api<NonNullable<typeof lista>>(`/api/admin/suporte?${q}`).then(setLista).catch((e) => setErro(String(e.message)));
  }, [filtro]);
  const carregarDetalhe = useCallback((id: string) => {
    api<Detalhe>(`/api/admin/suporte?conversa=${id}`).then(setDetalhe).catch((e) => store.avisar(String(e.message), "erro"));
  }, [store]);

  useEffect(() => {
    carregarConfig();
  }, [carregarConfig]);
  useEffect(() => {
    carregarLista();
    const t = setInterval(carregarLista, 15000);
    return () => clearInterval(t);
  }, [carregarLista]);
  useEffect(() => {
    if (!atual) {
      setDetalhe(null);
      return;
    }
    carregarDetalhe(atual);
    const t = setInterval(() => carregarDetalhe(atual), 10000);
    return () => clearInterval(t);
  }, [atual, carregarDetalhe]);
  useEffect(() => {
    const t = setTimeout(() => setFiltro((f) => ({ ...f, busca: buscaDigitada.trim() })), 400);
    return () => clearTimeout(t);
  }, [buscaDigitada]);

  if (erro) return <div className="conteudo"><div className="aviso erro">{erro}</div></div>;
  if (!config || !lista) return <div className="conteudo"><div className="girando" /></div>;
  const tagPorId = Object.fromEntries(config.tags.map((t) => [t.id, t]));

  async function acao(corpo: Record<string, unknown>, recarregar = true) {
    try {
      await api("/api/admin/suporte", { corpo });
      if (recarregar && atual) carregarDetalhe(atual);
      carregarLista();
      return true;
    } catch (e) {
      store.avisar(String((e as Error).message), "erro");
      return false;
    }
  }
  async function enviar(status?: string) {
    if (!texto.trim() || !atual) return;
    setEnviando(true);
    if (await acao({ acao: modoNota ? "nota" : "responder", conversa: atual, texto, status })) setTexto("");
    setEnviando(false);
  }
  const c = detalhe?.conversa;

  return (
    <div className="conteudo" style={{ maxWidth: "none" }}>
      <div className={`sup-caixa ${atual ? "com-conversa" : ""} ${verInfo ? "ver-info" : ""}`}>
        {/* Coluna 1: fila de conversas */}
        <section className="sup-coluna sup-lista">
          <div className="sup-cabeca">
            <div className="filtros" style={{ flexWrap: "wrap" }}>
              {STATUS.map(([id, nome]) => (
                <button key={id} className={`filtro ${filtro.status === id ? "ativo" : ""}`} onClick={() => setFiltro((f) => ({ ...f, status: id }))}>
                  {nome} ({lista.contagem[id] ?? 0})
                </button>
              ))}
              <button className={`filtro ${filtro.status === "" ? "ativo" : ""}`} onClick={() => setFiltro((f) => ({ ...f, status: "" }))}>Todas</button>
            </div>
            <input type="text" placeholder="Buscar por e-mail, conta, assunto ou texto…" value={buscaDigitada} onChange={(e) => setBuscaDigitada(e.target.value)} />
            <div className="linha" style={{ gap: 8, flexWrap: "wrap" }}>
              <select value={filtro.tag} onChange={(e) => setFiltro((f) => ({ ...f, tag: e.target.value }))} style={{ flex: 1 }}>
                <option value="">Todas as etiquetas</option>
                {config.tags.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
              <label className="linha" style={{ gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={filtro.minhas} onChange={(e) => setFiltro((f) => ({ ...f, minhas: e.target.checked }))} /> Só minhas
              </label>
              <button className="botao-icone" title="Etiquetas e respostas prontas" onClick={() => setGerenciar(true)}><Icone nome="config" /></button>
            </div>
          </div>
          <div className="sup-rolar">
            {lista.conversas.length === 0 && <p className="vazio">Nenhuma conversa aqui. 🎉</p>}
            {lista.conversas.map((x) => (
              <button key={x.id} className={`sup-item ${atual === x.id ? "ativo" : ""}`} onClick={() => { setAtual(x.id); setTexto(""); setModoNota(false); }}>
                <div className="linha" style={{ justifyContent: "space-between", gap: 8 }}>
                  <b style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className={`sup-prioridade-${x.prioridade}`}>
                    {x.prioridade === "urgente" ? "🔴 " : x.prioridade === "alta" ? "🟠 " : ""}{x.assunto}
                  </b>
                  {x.nao_lidas_equipe > 0 ? <span className="sup-contador">{x.nao_lidas_equipe}</span> : <small className="ajuda">{hora(x.ultima_msg_em)}</small>}
                </div>
                <div className="ajuda" style={{ fontSize: 12 }}>{x.conta} · {x.email}</div>
                <div className="sup-previa">{x.ultimo_autor === "equipe" ? "Você: " : ""}{x.ultima}</div>
                {(x.tags.length > 0 || x.responsavel) && (
                  <div className="linha" style={{ gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                    {x.tags.map((t) => tagPorId[t] && <EtiquetaTag key={t} tag={tagPorId[t]} />)}
                    {x.responsavel && <span className="etiqueta" style={{ fontSize: 10.5 }}>👤 {x.responsavel.split("@")[0]}</span>}
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Coluna 2: conversa */}
        <section className="sup-coluna sup-chat">
          {!atual ? (
            <p className="vazio" style={{ margin: "auto" }}>Escolha uma conversa na lista.</p>
          ) : !c ? (
            <div className="girando" style={{ margin: "auto" }} />
          ) : (
            <>
              <div className="sup-cabeca" style={{ flexDirection: "row", alignItems: "center" }}>
                <button className="botao-icone sup-voltar" onClick={() => setAtual(null)} aria-label="Voltar"><Icone nome="setaEsq" /></button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{c.assunto}</b>
                  <div className="ajuda" style={{ fontSize: 12 }}>{detalhe?.conta?.nome} · {c.email}</div>
                </div>
                <select value={c.status} onChange={(e) => acao({ acao: "atualizar", conversa: c.id, status: e.target.value })} style={{ width: "auto", maxWidth: 150 }}>
                  <option value="aberta">Aberta</option>
                  <option value="aguardando">Aguardando cliente</option>
                  <option value="resolvida">Resolvida</option>
                </select>
                <button className="botao-icone" title="Dados do cliente" onClick={() => setVerInfo((v) => !v)}><Icone nome="perfis" /></button>
              </div>
              <div className="sup-rolar">
                <Mensagens mensagens={detalhe!.mensagens} lado="equipe" />
              </div>
              <div className={`sup-escrever ${modoNota ? "nota" : ""}`}>
                <div className="linha" style={{ gap: 6, flexWrap: "wrap" }}>
                  <button className={`filtro ${!modoNota ? "ativo" : ""}`} onClick={() => setModoNota(false)}>Responder ao cliente</button>
                  <button className={`filtro ${modoNota ? "ativo" : ""}`} onClick={() => setModoNota(true)}>📝 Nota interna</button>
                  {config.respostas.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => {
                        const r = config.respostas.find((x) => x.id === e.target.value);
                        if (r) setTexto((t) => (t ? `${t}\n${r.texto}` : r.texto));
                      }}
                      style={{ width: "auto", marginLeft: "auto" }}
                    >
                      <option value="">⚡ Resposta pronta…</option>
                      {config.respostas.map((r) => <option key={r.id} value={r.id}>{r.titulo}</option>)}
                    </select>
                  )}
                </div>
                <textarea
                  placeholder={modoNota ? "Só a equipe vê esta nota (o cliente não recebe)." : "Escreva a resposta… (Ctrl+Enter envia)"}
                  value={texto}
                  maxLength={4000}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(); }}
                />
                <div className="linha" style={{ justifyContent: "flex-end", gap: 8 }}>
                  {!modoNota && (
                    <button className="botao sec peq" disabled={!texto.trim() || enviando} onClick={() => enviar("resolvida")}>
                      <Icone nome="check" tamanho={14} /> Enviar e resolver
                    </button>
                  )}
                  <button className="botao peq" disabled={!texto.trim() || enviando} onClick={() => enviar()}>
                    {enviando ? <span className="girando" /> : <Icone nome="enviar" tamanho={14} />} {modoNota ? "Salvar nota" : "Enviar"}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Coluna 3: cliente e organização */}
        <section className="sup-coluna sup-lateral">
          <div className="sup-rolar">
            {verInfo && <button className="botao-icone" style={{ float: "right" }} onClick={() => setVerInfo(false)} aria-label="Fechar"><Icone nome="x" /></button>}
            {!c ? (
              <p className="vazio">Os dados do cliente aparecem aqui.</p>
            ) : (
              <>
                <h3 style={{ marginTop: 0, fontSize: 15 }}>Organização</h3>
                <label className="ajuda" style={{ fontSize: 12 }}>Prioridade</label>
                <select value={c.prioridade} onChange={(e) => acao({ acao: "atualizar", conversa: c.id, prioridade: e.target.value })}>
                  {PRIORIDADES.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
                </select>
                <label className="ajuda" style={{ fontSize: 12, display: "block", marginTop: 10 }}>Responsável</label>
                <select value={c.responsavel ?? ""} onChange={(e) => acao({ acao: "atualizar", conversa: c.id, responsavel: e.target.value || null })}>
                  <option value="">Ninguém</option>
                  {config.equipe.map((e) => <option key={e} value={e}>{e === config.voce ? `Eu (${e})` : e}</option>)}
                </select>
                <label className="ajuda" style={{ fontSize: 12, display: "block", marginTop: 10 }}>Etiquetas (clique para marcar)</label>
                <div className="linha" style={{ gap: 5, flexWrap: "wrap", marginTop: 4 }}>
                  {config.tags.map((t) => {
                    const tem = c.tags.includes(t.id);
                    return (
                      <EtiquetaTag
                        key={t.id}
                        tag={t}
                        desligada={!tem}
                        onClick={() => acao({ acao: "atualizar", conversa: c.id, tags: tem ? c.tags.filter((x) => x !== t.id) : [...c.tags, t.id] })}
                      />
                    );
                  })}
                </div>

                {detalhe?.conta && (
                  <>
                    <h3 style={{ fontSize: 15, marginTop: 20 }}>Cliente</h3>
                    <dl className="sup-info" style={{ margin: 0 }}>
                      <dt>Conta</dt><dd>{detalhe.conta.nome}</dd>
                      <dt>Plano</dt><dd>{detalhe.conta.plano} {detalhe.conta.status !== "ativo" && <span className="etiqueta">{detalhe.conta.status}</span>}</dd>
                      <dt>Saldo</dt><dd>{formatarCreditos(Number(detalhe.conta.saldo))} créditos</dd>
                      <dt>Usado este mês</dt><dd>{formatarCreditos(Number(detalhe.conta.uso_mes))} créditos</dd>
                      <dt>Perfis</dt><dd>{detalhe.conta.perfis}</dd>
                      <dt>E-mails da equipe</dt><dd>{detalhe.conta.emails ?? c.email}</dd>
                      <dt>Cliente desde</dt><dd>{new Date(detalhe.conta.criado_em).toLocaleDateString("pt-BR")}</dd>
                      {detalhe.conta.renova_em && <><dt>Renova em</dt><dd>{new Date(detalhe.conta.renova_em).toLocaleDateString("pt-BR")}</dd></>}
                    </dl>
                  </>
                )}
                {detalhe && detalhe.outras.length > 0 && (
                  <>
                    <h3 style={{ fontSize: 15, marginTop: 20 }}>Outras conversas</h3>
                    {detalhe.outras.map((o) => (
                      <button key={o.id} className="sup-item" onClick={() => setAtual(o.id)}>
                        <div style={{ fontSize: 13 }}>{o.assunto}</div>
                        <div className="ajuda" style={{ fontSize: 11.5 }}>{o.status} · {hora(o.ultima_msg_em)}</div>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      {gerenciar && <Gerenciar config={config} fechar={() => setGerenciar(false)} recarregar={carregarConfig} acao={(x) => acao(x, false)} />}
    </div>
  );
}

function Gerenciar({ config, fechar, recarregar, acao }: {
  config: { tags: Tag[]; respostas: Resposta[] };
  fechar: () => void;
  recarregar: () => void;
  acao: (c: Record<string, unknown>) => Promise<boolean>;
}) {
  const [tag, setTag] = useState({ nome: "", cor: "#8b5cf6" });
  const [resp, setResp] = useState<{ id?: string; titulo: string; texto: string }>({ titulo: "", texto: "" });
  const rodar = async (c: Record<string, unknown>) => { if (await acao(c)) recarregar(); };
  return (
    <div className="modal-fundo" onClick={fechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="linha" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Etiquetas e respostas prontas</h3>
          <button className="botao-icone" onClick={fechar} aria-label="Fechar"><Icone nome="x" /></button>
        </div>
        <h4>Etiquetas</h4>
        <div className="linha" style={{ gap: 6, flexWrap: "wrap" }}>
          {config.tags.map((t) => (
            <span key={t.id} className="linha" style={{ gap: 2 }}>
              <EtiquetaTag tag={t} />
              <button className="botao-icone" style={{ width: 22, height: 22 }} title="Apagar" onClick={() => confirm(`Apagar a etiqueta "${t.nome}"?`) && rodar({ acao: "tag-apagar", id: t.id })}>
                <Icone nome="x" tamanho={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="linha" style={{ gap: 8, marginTop: 10 }}>
          <input type="text" placeholder="Nova etiqueta (ex.: Reembolso)" value={tag.nome} maxLength={30} onChange={(e) => setTag({ ...tag, nome: e.target.value })} />
          <input type="color" value={tag.cor} onChange={(e) => setTag({ ...tag, cor: e.target.value })} style={{ width: 48, padding: 2 }} />
          <button className="botao peq" disabled={!tag.nome.trim()} onClick={() => rodar({ acao: "tag-criar", ...tag }).then(() => setTag({ nome: "", cor: "#8b5cf6" }))}>Criar</button>
        </div>

        <h4 style={{ marginTop: 22 }}>Respostas prontas</h4>
        {config.respostas.map((r) => (
          <div key={r.id} className="linha" style={{ justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--borda)" }}>
            <span><b style={{ fontSize: 13.5 }}>{r.titulo}</b> <span className="ajuda" style={{ fontSize: 12 }}>{r.texto.slice(0, 60)}…</span></span>
            <span className="linha" style={{ gap: 4 }}>
              <button className="botao sec peq" onClick={() => setResp(r)}>Editar</button>
              <button className="botao-icone" onClick={() => confirm("Apagar esta resposta pronta?") && rodar({ acao: "resposta-apagar", id: r.id })}><Icone nome="lixo" tamanho={14} /></button>
            </span>
          </div>
        ))}
        <div className="lista" style={{ gap: 8, marginTop: 10 }}>
          <input type="text" placeholder="Título (ex.: Como recarregar créditos)" value={resp.titulo} maxLength={60} onChange={(e) => setResp({ ...resp, titulo: e.target.value })} />
          <textarea placeholder="Texto da resposta" value={resp.texto} onChange={(e) => setResp({ ...resp, texto: e.target.value })} />
          <div className="linha" style={{ justifyContent: "flex-end", gap: 8 }}>
            {resp.id && <button className="botao sec peq" onClick={() => setResp({ titulo: "", texto: "" })}>Cancelar edição</button>}
            <button className="botao peq" disabled={!resp.titulo.trim() || !resp.texto.trim()} onClick={() => rodar({ acao: "resposta-salvar", ...resp }).then(() => setResp({ titulo: "", texto: "" }))}>
              {resp.id ? "Salvar alterações" : "Adicionar resposta"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
