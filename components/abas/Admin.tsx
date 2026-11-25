"use client";

import { useCallback, useEffect, useState } from "react";
import { formatarCreditos } from "@/lib/custo";
import { api } from "@/lib/nuvem";
import { useStore } from "@/lib/store";
import { brl, formatarData } from "@/lib/util";
import Icone from "../Icone";

type ContaAdmin = {
  id: string;
  nome: string;
  emails: string | null;
  plano_id: string;
  status: string;
  saldo: string;
  preco_custom: string | null;
  creditos_mensais_custom: string | null;
  uso_mes: string;
  custo_usd_mes: string;
  renova_em: string | null;
  criado_em: string;
};

/** Painel do dono da plataforma: contas, planos (inclusive Empresa sob medida) e ajustes de créditos. */
export default function Admin() {
  const store = useStore();
  const cambio = store.nuvem?.cambio ?? 5.3;
  const [dados, setDados] = useState<{ contas: ContaAdmin[]; planos: { id: string; nome: string }[] } | null>(null);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<ContaAdmin | null>(null);

  const carregar = useCallback(() => {
    api<{ contas: ContaAdmin[]; planos: { id: string; nome: string }[] }>("/api/admin")
      .then(setDados)
      .catch((e) => store.avisar(String(e.message), "erro"));
  }, [store]);
  useEffect(carregar, [carregar]);

  if (!dados) return <div className="conteudo"><div className="girando" /></div>;
  const precoPlano: Record<string, number> = Object.fromEntries((store.nuvem?.planos ?? []).map((p) => [p.id, p.preco]));
  const ativos = dados.contas.filter((c) => c.status === "ativo");
  const receita = ativos.reduce((s, c) => s + Number(c.preco_custom ?? precoPlano[c.plano_id] ?? 0), 0);
  const custoMes = dados.contas.reduce((s, c) => s + Number(c.custo_usd_mes) * cambio, 0);
  const t = busca.toLowerCase();
  const lista = dados.contas.filter((c) => !t || `${c.nome} ${c.emails}`.toLowerCase().includes(t));

  return (
    <div className="conteudo">
      <div className="estatisticas" style={{ marginTop: 0 }}>
        <div className="estat"><strong>{dados.contas.length}</strong><span>Contas</span></div>
        <div className="estat"><strong>{ativos.length}</strong><span>Assinaturas ativas</span></div>
        <div className="estat"><strong>{brl(receita)}</strong><span>Receita mensal (planos ativos)</span></div>
        <div className="estat"><strong>{brl(custoMes)}</strong><span>Custo de IA no mês (estimado)</span></div>
      </div>
      <div className="linha" style={{ marginBottom: 12 }}>
        <input type="search" placeholder="Buscar por nome ou e-mail…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ maxWidth: 360 }} />
      </div>
      <div className="cartao" style={{ overflowX: "auto" }}>
        <table className="extrato">
          <thead>
            <tr>
              <th>Conta</th>
              <th>Plano</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Saldo</th>
              <th style={{ textAlign: "right" }}>Uso no mês</th>
              <th style={{ textAlign: "right" }}>Custo IA</th>
              <th>Desde</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td>
                  <b>{c.nome}</b>
                  <div className="ajuda" style={{ fontSize: 12 }}>{c.emails}</div>
                </td>
                <td>{dados.planos.find((p) => p.id === c.plano_id)?.nome ?? c.plano_id}</td>
                <td>{c.status}</td>
                <td style={{ textAlign: "right" }}>{formatarCreditos(Number(c.saldo))}</td>
                <td style={{ textAlign: "right" }}>{formatarCreditos(Number(c.uso_mes))}</td>
                <td style={{ textAlign: "right" }}>{brl(Number(c.custo_usd_mes) * cambio)}</td>
                <td style={{ whiteSpace: "nowrap" }}>{formatarData(c.criado_em).split(",")[0]}</td>
                <td>
                  <button className="botao sec peq" onClick={() => setEditando(c)}>
                    <Icone nome="editar" tamanho={14} /> Gerenciar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editando && (
        <ModalConta
          conta={editando}
          planos={dados.planos}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function ModalConta({
  conta,
  planos,
  aoFechar,
  aoSalvar,
}: {
  conta: ContaAdmin;
  planos: { id: string; nome: string }[];
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const store = useStore();
  const [plano, setPlano] = useState(conta.plano_id);
  const [status, setStatus] = useState(conta.status);
  const [creditosMensais, setCreditosMensais] = useState(conta.creditos_mensais_custom ?? "");
  const [preco, setPreco] = useState(conta.preco_custom ?? "");
  const [ajuste, setAjuste] = useState("");
  const [motivo, setMotivo] = useState("");

  async function salvarPlano() {
    try {
      await api("/api/admin", {
        corpo: {
          acao: "plano",
          conta: conta.id,
          plano,
          status,
          creditosMensais: creditosMensais === "" ? null : Number(creditosMensais),
          preco: preco === "" ? null : Number(preco),
        },
      });
      if (ajuste && Number(ajuste)) {
        await api("/api/admin", { corpo: { acao: "creditos", conta: conta.id, creditos: Number(ajuste), motivo: motivo || undefined } });
      }
      store.avisar("Conta atualizada.", "ok");
      aoSalvar();
    } catch (e) {
      store.avisar(e instanceof Error ? e.message : String(e), "erro");
    }
  }

  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{conta.nome}</h3>
        <p className="ajuda" style={{ marginTop: -4 }}>{conta.emails}</p>
        <div className="grade-2">
          <div className="campo">
            <label>Plano</label>
            <select value={plano} onChange={(e) => setPlano(e.target.value)}>
              {planos.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {["teste", "ativo", "atrasado", "cancelado"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Créditos por mês (Empresa; vazio = do plano)</label>
            <input type="number" value={creditosMensais} onChange={(e) => setCreditosMensais(e.target.value)} />
          </div>
          <div className="campo">
            <label>Valor mensal combinado (R$; vazio = do plano)</label>
            <input type="number" value={preco} onChange={(e) => setPreco(e.target.value)} />
          </div>
          <div className="campo">
            <label>Ajustar créditos agora (+ ou −)</label>
            <input type="number" value={ajuste} onChange={(e) => setAjuste(e.target.value)} placeholder="ex.: 500 ou -50" />
          </div>
          <div className="campo">
            <label>Motivo do ajuste</label>
            <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: Contrato Empresa de março" />
          </div>
        </div>
        <p className="ajuda">
          Para o plano Empresa: escolha &quot;Empresa&quot;, status &quot;ativo&quot;, informe os créditos e o valor combinados e
          coloque os créditos do primeiro mês no ajuste. A cobrança do Empresa você faz por fora (ou pelo Asaas manualmente).
        </p>
        <div className="linha" style={{ justifyContent: "flex-end" }}>
          <button className="botao sec" onClick={aoFechar}>Cancelar</button>
          <button className="botao" onClick={salvarPlano}>Salvar</button>
        </div>
      </div>
    </div>
  );
}
