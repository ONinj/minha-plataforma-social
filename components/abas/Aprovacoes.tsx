"use client";

import { useState } from "react";
import { agendarNoInstagram, useInstagram } from "@/lib/instagram";
import { useStore } from "@/lib/store";
import { REDES, type Agendamento, type Aprovacao } from "@/lib/tipos";
import { agoraISO, formatarData, novoId } from "@/lib/util";
import Markdown from "../Markdown";
import { BotaoBaixar, CartaoMidia } from "../MidiaView";

const FILTROS: { id: Aprovacao["status"] | "todos"; nome: string }[] = [
  { id: "pendente", nome: "Aguardando" },
  { id: "ajuste", nome: "Em ajuste" },
  { id: "aprovado", nome: "Aprovados" },
  { id: "reprovado", nome: "Reprovados" },
  { id: "todos", nome: "Todos" },
];

const NOMES_STATUS: Record<Aprovacao["status"], string> = {
  pendente: "Aguardando aprovação",
  ajuste: "Ajuste pedido",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
};

export default function Aprovacoes({ falarComGerente }: { falarComGerente: (texto: string) => void }) {
  const { estado } = useStore();
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("pendente");
  const itens = estado.aprovacoes.filter((a) => filtro === "todos" || a.status === filtro);

  return (
    <div className="conteudo">
      <div className="filtros">
        {FILTROS.map((f) => {
          const n = f.id === "todos" ? estado.aprovacoes.length : estado.aprovacoes.filter((a) => a.status === f.id).length;
          return (
            <button key={f.id} className={`filtro ${filtro === f.id ? "ativo" : ""}`} onClick={() => setFiltro(f.id)}>
              {f.nome} ({n})
            </button>
          );
        })}
      </div>
      {itens.length === 0 ? (
        <p className="vazio">
          Nada aqui. Peça algo ao gerente na <b>Central</b> e as peças prontas aparecem nesta aba.
        </p>
      ) : (
        <div className="lista">
          {itens.map((a) => (
            <ItemAprovacao key={a.id} item={a} falarComGerente={falarComGerente} />
          ))}
        </div>
      )}
    </div>
  );
}

function ItemAprovacao({ item, falarComGerente }: { item: Aprovacao; falarComGerente: (t: string) => void }) {
  const store = useStore();
  const [legenda, setLegenda] = useState(item.legenda);
  const [hashtags, setHashtags] = useState(item.hashtags);
  const [data, setData] = useState(item.dataPublicacao ?? "");
  const [redes, setRedes] = useState<string[]>(item.redes);
  const [feedback, setFeedback] = useState("");
  const [pedindoAjuste, setPedindoAjuste] = useState(false);
  const ig = useInstagram(store);
  const [publicarAuto, setPublicarAuto] = useState(true);
  const midias = item.midias.map((id) => store.estado.midias.find((m) => m.id === id)).filter(Boolean);
  const aindaGerando = midias.some((m) => m!.status === "gerando");
  const ePlanejamento = item.tipo === "planejamento";
  const editavel = item.status === "pendente" || item.status === "ajuste";

  function atualizar(dados: Partial<Aprovacao>) {
    store.atualizar((e) => ({ ...e, aprovacoes: e.aprovacoes.map((a) => (a.id === item.id ? { ...a, ...dados } : a)) }));
  }

  function aprovar() {
    if (!ePlanejamento && !data) {
      window.alert("Defina a data e hora de publicação antes de aprovar.");
      return;
    }
    atualizar({ status: "aprovado", legenda, hashtags, dataPublicacao: data || undefined, redes });
    if (ePlanejamento) return;
    const agendamento: Agendamento = {
      id: novoId("agd"),
      aprovacaoId: item.id,
      titulo: item.titulo,
      tipo: item.tipo,
      redes,
      legenda,
      hashtags,
      data,
      midias: item.midias,
      status: "a_programar",
      criadoEm: agoraISO(),
      atualizadoEm: agoraISO(),
    };
    store.atualizar((e) => ({ ...e, agendamentos: [...e.agendamentos, agendamento] }));
    if (ig.conexao && publicarAuto && agendamento.midias.length) {
      store.avisar("Preparando a publicação automática no Instagram...", "info");
      agendarNoInstagram(store, agendamento)
        .then(() => store.avisar(`Agendado no Instagram para ${formatarData(agendamento.data)}.`, "ok"))
        .catch((e) => store.avisar(`Não consegui agendar no Instagram: ${e instanceof Error ? e.message : e}`, "erro"));
    }
  }

  function enviarAjuste() {
    if (!feedback.trim()) return;
    atualizar({ status: "ajuste", feedback: feedback.trim(), legenda, hashtags, redes, dataPublicacao: data || undefined });
    falarComGerente(
      `Pedi ajuste no item "${item.titulo}" (id ${item.id}): ${feedback.trim()}\nRefaça o que for preciso e envie uma nova versão para aprovação.`,
    );
  }

  return (
    <div className="cartao item-aprovacao">
      <div className="linha" style={{ justifyContent: "space-between" }}>
        <div>
          <h3 style={{ margin: 0 }}>{item.titulo}</h3>
          <span className="ajuda">
            {item.tipo} · criado {formatarData(item.criadoEm)} ·{" "}
            <span className={`status-${item.status}`}>{NOMES_STATUS[item.status]}</span>
          </span>
        </div>
      </div>

      {midias.length > 0 && (
        <div className="grade-midias" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {midias.map((m) => (
            <CartaoMidia key={m!.id} midia={m!} acoes={<BotaoBaixar midia={m!} />} />
          ))}
        </div>
      )}

      {ePlanejamento ? (
        <div className="msg ia" style={{ maxWidth: "100%" }}>
          <Markdown texto={item.legenda} />
        </div>
      ) : (
        <>
          <div className="campo">
            <label>Legenda</label>
            <textarea rows={6} value={legenda} disabled={!editavel} onChange={(e) => setLegenda(e.target.value)} />
          </div>
          <div className="grade-2">
            <div className="campo">
              <label>Hashtags</label>
              <input type="text" value={hashtags} disabled={!editavel} onChange={(e) => setHashtags(e.target.value)} />
            </div>
            <div className="campo">
              <label>Data e hora de publicação</label>
              <input type="datetime-local" value={data} disabled={!editavel} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div className="campo">
            <label>Redes</label>
            <div className="linha">
              {REDES.map((r) => (
                <label key={r} className="linha" style={{ margin: 0, gap: 4 }}>
                  <input
                    type="checkbox"
                    disabled={!editavel}
                    checked={redes.includes(r)}
                    onChange={(e) => setRedes((s) => (e.target.checked ? [...s, r] : s.filter((x) => x !== r)))}
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {item.observacoes && <p className="ajuda">📝 {item.observacoes}</p>}
      {item.feedback && <p className="ajuda">🔁 Ajuste pedido: {item.feedback}</p>}

      {editavel && (
        <>
          {pedindoAjuste && (
            <div className="campo">
              <label>O que precisa mudar?</label>
              <textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Ex.: troque a cor do fundo para azul e deixe a legenda mais curta" />
            </div>
          )}
          {ig.conexao && !ePlanejamento && midias.length > 0 && (
            <label className="linha" style={{ margin: 0, cursor: "pointer" }}>
              <input type="checkbox" checked={publicarAuto} onChange={(e) => setPublicarAuto(e.target.checked)} />
              Publicar automaticamente no Instagram (@{ig.conexao.username}) na data marcada
            </label>
          )}
          <div className="linha">
            <button className="botao ok" onClick={aprovar} disabled={aindaGerando} title={aindaGerando ? "Espere o vídeo ficar pronto" : ""}>
              ✓ Aprovar
            </button>
            {pedindoAjuste ? (
              <button className="botao" onClick={enviarAjuste} disabled={!feedback.trim()}>
                Enviar ajuste ao gerente
              </button>
            ) : (
              <button className="botao sec" onClick={() => setPedindoAjuste(true)}>
                Pedir ajuste
              </button>
            )}
            <button className="botao perigo" onClick={() => atualizar({ status: "reprovado" })}>
              Reprovar
            </button>
          </div>
        </>
      )}

      {item.status === "aprovado" && ePlanejamento && (
        <div className="linha">
          <button
            className="botao"
            onClick={() =>
              falarComGerente(
                `Aprovei o planejamento "${item.titulo}" (id ${item.id}). Pode produzir as peças e enviar cada uma para aprovação.`,
              )
            }
          >
            Pedir ao gerente para produzir as peças
          </button>
        </div>
      )}
      {item.status === "aprovado" && !ePlanejamento && (
        <p className="ajuda">Está na aba Agendamentos, marcado como “A programar”.</p>
      )}
    </div>
  );
}
