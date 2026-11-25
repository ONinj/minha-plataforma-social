"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { REDES, type Agendamento, type StatusAgendamento, type TipoConteudo } from "@/lib/tipos";
import { agoraISO, formatarData, novoId } from "@/lib/util";
import { BotaoBaixar, CartaoMidia } from "../MidiaView";

export const NOMES_STATUS_AGD: Record<StatusAgendamento, string> = {
  a_programar: "A programar",
  programado: "Programado",
  postado: "Postado",
  cancelado: "Cancelado",
};

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function chaveDia(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Agendamentos() {
  const { estado } = useStore();
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [filtro, setFiltro] = useState<StatusAgendamento | "todos">("todos");
  const [aberto, setAberto] = useState<Agendamento | "novo" | null>(null);

  const doMes = estado.agendamentos
    .filter((a) => {
      const d = new Date(a.data);
      return d.getFullYear() === mes.getFullYear() && d.getMonth() === mes.getMonth();
    })
    .sort((a, b) => a.data.localeCompare(b.data));

  const porDia = useMemo(() => {
    const mapa = new Map<string, Agendamento[]>();
    for (const a of doMes) {
      const k = a.data.slice(0, 10);
      mapa.set(k, [...(mapa.get(k) ?? []), a]);
    }
    return mapa;
  }, [doMes]);

  const inicio = new Date(mes);
  inicio.setDate(1 - inicio.getDay());
  const dias = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    return d;
  });
  const hoje = chaveDia(new Date());
  const contagem = (s: StatusAgendamento) => doMes.filter((a) => a.status === s).length;
  const lista = doMes.filter((a) => filtro === "todos" || a.status === filtro);

  return (
    <div className="conteudo">
      <div className="linha" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div className="linha">
          <button className="botao sec peq" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>
            ←
          </button>
          <h2 style={{ margin: 0, fontSize: 18, minWidth: 170, textAlign: "center" }}>
            {(() => {
              const t = mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
              return t.charAt(0).toUpperCase() + t.slice(1);
            })()}
          </h2>
          <button className="botao sec peq" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>
            →
          </button>
        </div>
        <button className="botao" onClick={() => setAberto("novo")}>
          + Agendamento manual
        </button>
      </div>

      <div className="resumo">
        {(Object.keys(NOMES_STATUS_AGD) as StatusAgendamento[]).map((s) => (
          <div key={s} className="cartao">
            <span className={`status-${s}`}>{NOMES_STATUS_AGD[s]}</span>
            <strong>{contagem(s)}</strong>
          </div>
        ))}
      </div>

      <div className="calendario" style={{ marginBottom: 24 }}>
        {DIAS.map((d) => (
          <div key={d} className="cal-cab">
            {d}
          </div>
        ))}
        {dias.map((d) => {
          const k = chaveDia(d);
          return (
            <div key={k} className={`dia ${d.getMonth() !== mes.getMonth() ? "fora" : ""} ${k === hoje ? "hoje" : ""}`}>
              <div className="num">{d.getDate()}</div>
              {(porDia.get(k) ?? []).map((a) => (
                <button key={a.id} className={`evento ${a.status}`} onClick={() => setAberto(a)} title={a.titulo}>
                  {a.data.slice(11, 16)} {a.titulo}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <div className="filtros">
        {(["todos", "a_programar", "programado", "postado", "cancelado"] as const).map((s) => (
          <button key={s} className={`filtro ${filtro === s ? "ativo" : ""}`} onClick={() => setFiltro(s)}>
            {s === "todos" ? "Todos" : NOMES_STATUS_AGD[s]}
          </button>
        ))}
      </div>
      {lista.length === 0 ? (
        <p className="vazio">Nenhum agendamento neste mês.</p>
      ) : (
        <div className="lista">
          {lista.map((a) => (
            <button key={a.id} className="cartao" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => setAberto(a)}>
              <div className="linha" style={{ justifyContent: "space-between" }}>
                <b>{a.titulo}</b>
                <span className={`status-${a.status}`}>{NOMES_STATUS_AGD[a.status]}</span>
              </div>
              <span className="ajuda">
                {formatarData(a.data)} · {a.tipo} · {a.redes.join(", ") || "sem rede"}
              </span>
            </button>
          ))}
        </div>
      )}

      {aberto && <ModalAgendamento item={aberto === "novo" ? null : aberto} aoFechar={() => setAberto(null)} />}
    </div>
  );
}

function ModalAgendamento({ item, aoFechar }: { item: Agendamento | null; aoFechar: () => void }) {
  const store = useStore();
  const [titulo, setTitulo] = useState(item?.titulo ?? "");
  const [tipo, setTipo] = useState<TipoConteudo>(item?.tipo ?? "post");
  const [data, setData] = useState(item?.data ?? "");
  const [legenda, setLegenda] = useState(item?.legenda ?? "");
  const [hashtags, setHashtags] = useState(item?.hashtags ?? "");
  const [redes, setRedes] = useState<string[]>(item?.redes ?? ["Instagram"]);
  const [status, setStatus] = useState<StatusAgendamento>(item?.status ?? "a_programar");
  const [copiado, setCopiado] = useState(false);
  const midias = (item?.midias ?? []).map((id) => store.estado.midias.find((m) => m.id === id)).filter(Boolean);

  function salvar() {
    if (!titulo.trim() || !data) {
      window.alert("Preencha título e data.");
      return;
    }
    const dados = { titulo, tipo, data, legenda, hashtags, redes, status, atualizadoEm: agoraISO() };
    store.atualizar((e) => ({
      ...e,
      agendamentos: item
        ? e.agendamentos.map((a) => (a.id === item.id ? { ...a, ...dados } : a))
        : [...e.agendamentos, { ...dados, id: novoId("agd"), midias: [], criadoEm: agoraISO() }],
    }));
    aoFechar();
  }

  function excluir() {
    if (!item || !window.confirm("Excluir este agendamento?")) return;
    store.atualizar((e) => ({ ...e, agendamentos: e.agendamentos.filter((a) => a.id !== item.id) }));
    aoFechar();
  }

  async function copiarLegenda() {
    await navigator.clipboard.writeText([legenda, hashtags].filter(Boolean).join("\n\n"));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{item ? "Agendamento" : "Novo agendamento"}</h3>

        <div className="campo">
          <label>Status</label>
          <div className="linha">
            {(Object.keys(NOMES_STATUS_AGD) as StatusAgendamento[]).map((s) => (
              <button key={s} className={`filtro ${status === s ? "ativo" : ""}`} onClick={() => setStatus(s)}>
                {NOMES_STATUS_AGD[s]}
              </button>
            ))}
          </div>
        </div>

        {midias.length > 0 && (
          <div className="grade-midias" style={{ marginBottom: 14 }}>
            {midias.map((m) => (
              <CartaoMidia key={m!.id} midia={m!} acoes={<BotaoBaixar midia={m!} />} />
            ))}
          </div>
        )}

        <div className="grade-2">
          <div className="campo">
            <label>Título</label>
            <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="campo">
            <label>Formato</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoConteudo)}>
              {["post", "carrossel", "reels", "story", "outro"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="campo">
          <label>Data e hora</label>
          <input type="datetime-local" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="campo">
          <label>Redes</label>
          <div className="linha">
            {REDES.map((r) => (
              <label key={r} className="linha" style={{ margin: 0, gap: 4 }}>
                <input
                  type="checkbox"
                  checked={redes.includes(r)}
                  onChange={(e) => setRedes((s) => (e.target.checked ? [...s, r] : s.filter((x) => x !== r)))}
                />
                {r}
              </label>
            ))}
          </div>
        </div>
        <div className="campo">
          <label>Legenda</label>
          <textarea rows={5} value={legenda} onChange={(e) => setLegenda(e.target.value)} />
        </div>
        <div className="campo">
          <label>Hashtags</label>
          <input type="text" value={hashtags} onChange={(e) => setHashtags(e.target.value)} />
        </div>

        <div className="linha" style={{ justifyContent: "space-between" }}>
          <div className="linha">
            <button className="botao sec" onClick={copiarLegenda}>
              {copiado ? "Copiado!" : "Copiar legenda"}
            </button>
            {item && (
              <button className="botao perigo" onClick={excluir}>
                Excluir
              </button>
            )}
          </div>
          <div className="linha">
            <button className="botao sec" onClick={aoFechar}>
              Fechar
            </button>
            <button className="botao" onClick={salvar}>
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
