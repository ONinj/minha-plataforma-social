"use client";

import { useCallback, useEffect, useState } from "react";
import { formatarCreditos } from "@/lib/custo";
import { api } from "@/lib/nuvem";
import { useStore } from "@/lib/store";
import { brl, formatarData } from "@/lib/util";
import Icone from "../Icone";
import Diagnostico from "../Diagnostico";

type Painel = {
  resumo: {
    total: number; ativas: number; teste: number; atrasadas: number; canceladas: number; novas_mes: number; novas_24h: number;
    negativas: number; creditos_em_aberto: number; mrr: number; recebido_mes: number; recebido_mes_liquido: number;
    recebido_mes_anterior: number; recargas_mes: number; custo_mes: number; custo_mes_anterior: number; custo_24h: number;
    creditos_usados_mes: number; acoes_mes: number; ticket_medio: number;
  };
  serie: { dia: string; custo: number; recebido: number }[];
  categorias: { categoria: string; vezes: number; custo: number }[];
  topContas: { id: string; nome: string; plano_id: string; status: string; saldo: number; custo: number; preco: number }[];
  recentes: { id: string; tipo: string; valor: number; estornado: boolean; criado_em: string; nome: string | null }[];
  planos: { id: string; nome: string; preco: number; creditos_mensais: number; max_perfis: number; publico: boolean; assinantes: number; receita: number }[];
  config: { cambio: number; margem: number; alerta_gasto_mensal: number; dolar_hoje: number | null };
  alertas: { nivel: "erro" | "aviso" | "info"; texto: string }[];
  integracoes: { nome: string; ok: boolean; detalhe?: string }[];
};

export function usePainel() {
  const store = useStore();
  const [dados, setDados] = useState<Painel | null>(null);
  const carregar = useCallback(() => {
    api<Painel>("/api/admin/painel")
      .then(setDados)
      .catch((e) => store.avisar(String(e.message), "erro"));
  }, [store]);
  useEffect(carregar, [carregar]);
  return { dados, carregar };
}

const COR_ALERTA = { erro: "var(--erro)", aviso: "var(--alerta)", info: "var(--texto-2)" };
const ICONE_ALERTA = { erro: "⛔", aviso: "⚠️", info: "ℹ️" };

function variacao(atual: number, anterior: number) {
  if (!anterior) return null;
  const v = ((atual - anterior) / anterior) * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(0)}% vs. mês passado`;
}

function Kpi({ valor, rotulo, sub, cor }: { valor: string; rotulo: string; sub?: string | null; cor?: string }) {
  return (
    <div className="estat" style={{ cursor: "default" }}>
      <strong style={cor ? { color: cor } : undefined}>{valor}</strong>
      <span>{rotulo}</span>
      {sub && <span style={{ display: "block", fontSize: 11.5, color: "var(--texto-3)", marginTop: 4 }}>{sub}</span>}
    </div>
  );
}

/** Gráfico de barras de uma série: custo de IA por dia (30 dias), com dica ao passar o mouse. */
function GraficoCusto({ serie }: { serie: Painel["serie"] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const max = Math.max(1, ...serie.map((d) => d.custo));
  const total = serie.reduce((s, d) => s + d.custo, 0);
  const d = foco != null ? serie[foco] : null;
  const dia = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  return (
    <div>
      <div className="linha" style={{ justifyContent: "space-between", marginBottom: 8, minHeight: 20 }}>
        <span className="ajuda" style={{ margin: 0 }}>Total em 30 dias: <b style={{ color: "var(--texto)" }}>{brl(total)}</b></span>
        {d && (
          <span className="ajuda" style={{ margin: 0 }}>
            {dia(d.dia)}: custo <b style={{ color: "var(--texto)" }}>{brl(d.custo)}</b> · recebido <b style={{ color: "var(--texto)" }}>{brl(d.recebido)}</b>
          </span>
        )}
      </div>
      <div
        role="img"
        aria-label={`Custo de IA por dia nos últimos 30 dias. Total ${brl(total)}.`}
        style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 140, borderBottom: "1px solid var(--borda)" }}
        onMouseLeave={() => setFoco(null)}
      >
        {serie.map((s, i) => (
          <div
            key={s.dia}
            onMouseEnter={() => setFoco(i)}
            style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", cursor: "default" }}
          >
            <div
              style={{
                width: "100%",
                height: `${Math.max(s.custo > 0 ? 2 : 0, (s.custo / max) * 100)}%`,
                background: foco === i ? "var(--destaque-2)" : "var(--destaque)",
                borderRadius: "4px 4px 0 0",
              }}
            />
          </div>
        ))}
      </div>
      <div className="linha" style={{ justifyContent: "space-between", fontSize: 11, color: "var(--texto-3)", marginTop: 4 }}>
        <span>{serie[0] && dia(serie[0].dia)}</span>
        <span>hoje</span>
      </div>
    </div>
  );
}

/** Visão geral do negócio: dinheiro, custos, alertas, uso e integrações. */
export function VisaoGeral({ dados, recarregar }: { dados: Painel; recarregar: () => void }) {
  const r = dados.resumo;
  const lucro = r.recebido_mes_liquido - r.custo_mes;
  const maxCat = Math.max(1, ...dados.categorias.map((c) => c.custo));
  return (
    <>
      {dados.alertas.length > 0 && (
        <div className="cartao" style={{ marginBottom: 16 }}>
          <h3><Icone nome="sino" /> Alertas</h3>
          <div className="lista" style={{ gap: 6 }}>
            {dados.alertas.map((a, i) => (
              <div key={i} style={{ borderLeft: `3px solid ${COR_ALERTA[a.nivel]}`, paddingLeft: 10, fontSize: 13.5 }}>
                {ICONE_ALERTA[a.nivel]} {a.texto}
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 style={{ margin: "4px 0 0" }}>Dinheiro (este mês)</h3>
      <div className="estatisticas" style={{ marginTop: 10 }}>
        <Kpi valor={brl(r.recebido_mes)} rotulo="Recebido no mês" sub={variacao(r.recebido_mes, r.recebido_mes_anterior) ?? `Líquido (após taxas): ${brl(r.recebido_mes_liquido)}`} />
        <Kpi valor={brl(r.custo_mes)} rotulo="Custo de IA no mês" sub={variacao(r.custo_mes, r.custo_mes_anterior) ?? `Últimas 24 h: ${brl(r.custo_24h)}`} />
        <Kpi valor={brl(lucro)} rotulo="Sobra (líquido − IA)" cor={lucro < 0 ? "var(--erro)" : "var(--ok)"} sub="Sem contar Vercel, Supabase e impostos" />
        <Kpi valor={brl(r.mrr)} rotulo="Receita mensal recorrente" sub={`Ticket médio: ${brl(r.ticket_medio)}`} />
      </div>

      <h3 style={{ margin: "4px 0 0" }}>Clientes</h3>
      <div className="estatisticas" style={{ marginTop: 10 }}>
        <Kpi valor={String(r.ativas)} rotulo="Assinaturas ativas" sub={`${r.total} contas no total`} />
        <Kpi valor={String(r.teste)} rotulo="Em teste grátis" sub={`${r.novas_mes} novas este mês · ${r.novas_24h} em 24 h`} />
        <Kpi valor={String(r.atrasadas)} rotulo="Pagamento atrasado" cor={r.atrasadas ? "var(--alerta)" : undefined} sub={`${r.canceladas} canceladas`} />
        <Kpi
          valor={formatarCreditos(r.creditos_em_aberto)}
          rotulo="Créditos em aberto"
          sub={`Se todos forem usados: ~${brl((r.creditos_em_aberto * 0.1) / dados.config.margem)} de IA`}
        />
      </div>

      <div className="grade-2" style={{ marginBottom: 16 }}>
        <div className="cartao">
          <h3><Icone nome="relogio" /> Custo de IA por dia</h3>
          <GraficoCusto serie={dados.serie} />
        </div>
        <div className="cartao">
          <h3><Icone nome="raio" /> Onde o custo está indo (mês)</h3>
          {dados.categorias.length === 0 ? (
            <p className="ajuda">Nenhum uso este mês ainda.</p>
          ) : (
            <div className="lista" style={{ gap: 10 }}>
              {dados.categorias.map((c) => (
                <div key={c.categoria}>
                  <div className="linha" style={{ justifyContent: "space-between", fontSize: 13 }}>
                    <span>{c.categoria} <span className="ajuda">· {c.vezes}×</span></span>
                    <b>{brl(c.custo)}</b>
                  </div>
                  <div className="barra" style={{ marginTop: 4 }}>
                    <div style={{ width: `${(c.custo / maxCat) * 100}%`, background: "var(--destaque)" }} />
                  </div>
                </div>
              ))}
              <p className="ajuda" style={{ margin: 0 }}>{formatarCreditos(r.creditos_usados_mes)} créditos usados em {r.acoes_mes} ações.</p>
            </div>
          )}
        </div>
      </div>

      <div className="grade-2" style={{ marginBottom: 16 }}>
        <div className="cartao" style={{ overflowX: "auto" }}>
          <h3><Icone nome="perfis" /> Contas que mais gastam (mês)</h3>
          <table className="extrato">
            <thead>
              <tr><th>Conta</th><th>Plano</th><th style={{ textAlign: "right" }}>Custo IA</th><th style={{ textAlign: "right" }}>Paga</th></tr>
            </thead>
            <tbody>
              {dados.topContas.map((c) => (
                <tr key={c.id}>
                  <td>{c.nome}</td>
                  <td>{dados.planos.find((p) => p.id === c.plano_id)?.nome ?? c.plano_id}</td>
                  <td style={{ textAlign: "right", color: c.preco && c.custo > c.preco * 0.8 ? "var(--alerta)" : undefined }}>{brl(c.custo)}</td>
                  <td style={{ textAlign: "right" }}>{c.status === "ativo" ? brl(c.preco) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ajuda" style={{ fontSize: 12 }}>Em amarelo: a IA já custou mais de 80% do que a conta paga.</p>
        </div>
        <div className="cartao" style={{ overflowX: "auto" }}>
          <h3><Icone nome="carteira" /> Últimos pagamentos</h3>
          {dados.recentes.length === 0 ? (
            <p className="ajuda">Nenhum pagamento registrado ainda. Eles aparecem aqui quando o Asaas avisar.</p>
          ) : (
            <table className="extrato">
              <tbody>
                {dados.recentes.map((p) => (
                  <tr key={p.id}>
                    <td style={{ whiteSpace: "nowrap", color: "var(--texto-3)" }}>{formatarData(p.criado_em)}</td>
                    <td>{p.nome ?? "—"} <span className="ajuda">· {p.tipo}</span></td>
                    <td style={{ textAlign: "right", textDecoration: p.estornado ? "line-through" : undefined }}>{brl(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grade-2">
        <ConfigPlataforma config={dados.config} aoSalvar={recarregar} />
        <div className="cartao">
          <div className="linha" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}><Icone nome="config" /> Integrações</h3>
            <Diagnostico rotulo="Diagnóstico" />
          </div>
          <div className="lista" style={{ gap: 6 }}>
            {dados.integracoes.map((i) => (
              <div key={i.nome} className="linha" style={{ justifyContent: "space-between", fontSize: 13.5 }}>
                <span>{i.nome}</span>
                <span style={{ color: i.ok ? "var(--ok)" : "var(--texto-3)" }}>
                  {i.ok ? `✓ ligado${i.detalhe ? ` (${i.detalhe})` : ""}` : "— desligado"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function ConfigPlataforma({ config, aoSalvar }: { config: Painel["config"]; aoSalvar: () => void }) {
  const store = useStore();
  const [cambio, setCambio] = useState(String(config.cambio));
  const [margem, setMargem] = useState(String(Math.round((config.margem - 1) * 100)));
  const [alerta, setAlerta] = useState(String(config.alerta_gasto_mensal || ""));
  async function salvar() {
    try {
      await api("/api/admin/painel", {
        corpo: { acao: "config", cambio: Number(cambio.replace(",", ".")), margem: 1 + Number(margem || 0) / 100, alerta: Number(alerta || 0) },
      });
      store.avisar("Configurações salvas. Valem para os próximos usos.", "ok");
      aoSalvar();
      store.recarregarNuvem();
    } catch (e) {
      store.avisar(e instanceof Error ? e.message : String(e), "erro");
    }
  }
  return (
    <div className="cartao">
      <h3><Icone nome="carteira" /> Configurações da plataforma</h3>
      <div className="campo">
        <label>Câmbio usado nos créditos (R$ por dólar)</label>
        <div className="linha">
          <input type="text" inputMode="decimal" value={cambio} onChange={(e) => setCambio(e.target.value)} style={{ maxWidth: 120 }} />
          {config.dolar_hoje && (
            <button className="botao sec peq" onClick={() => setCambio((Math.ceil(config.dolar_hoje! * 20) / 20).toFixed(2))}>
              Usar o dólar de hoje (R$ {config.dolar_hoje.toFixed(2)})
            </button>
          )}
        </div>
      </div>
      <div className="campo">
        <label>Margem sobre o custo das IAs (%)</label>
        <input type="number" min={0} max={200} value={margem} onChange={(e) => setMargem(e.target.value)} style={{ maxWidth: 120 }} />
        <span className="ajuda" style={{ fontSize: 12 }}>
          0% = cada crédito vale R$ 0,10 de IA. Com 20%, cada ação gasta 20% mais créditos (o seu lucro sobre o uso).
        </span>
      </div>
      <div className="campo">
        <label>Me avisar quando o gasto com IA do mês passar de (R$)</label>
        <input type="number" min={0} value={alerta} placeholder="ex.: 500" onChange={(e) => setAlerta(e.target.value)} style={{ maxWidth: 160 }} />
        <span className="ajuda" style={{ fontSize: 12 }}>O aviso aparece aqui e quando você entra na plataforma (a partir de 80%).</span>
      </div>
      <button className="botao" onClick={salvar}>Salvar</button>
    </div>
  );
}

/** Planos: preço, créditos e perfis editáveis, com assinantes e receita de cada um. */
export function PlanosAdmin({ dados, recarregar }: { dados: Painel; recarregar: () => void }) {
  const store = useStore();
  const [edicao, setEdicao] = useState<Record<string, { preco: string; creditos: string; perfis: string }>>(() =>
    Object.fromEntries(dados.planos.map((p) => [p.id, { preco: String(p.preco), creditos: String(p.creditos_mensais), perfis: String(p.max_perfis) }])),
  );
  const custoCredito = 0.1 / dados.config.margem;
  async function salvar(id: string) {
    const e = edicao[id];
    try {
      await api("/api/admin/painel", {
        corpo: { acao: "plano", id, preco: Number(e.preco.replace(",", ".")), creditos: Number(e.creditos), maxPerfis: Number(e.perfis) },
      });
      store.avisar("Plano salvo.", "ok");
      recarregar();
      store.recarregarNuvem();
    } catch (err) {
      store.avisar(err instanceof Error ? err.message : String(err), "erro");
    }
  }
  return (
    <div className="cartao" style={{ overflowX: "auto" }}>
      <h3><Icone nome="estrela" /> Planos e preços</h3>
      <p className="ajuda" style={{ marginTop: -4 }}>
        Mudar o preço vale para as próximas assinaturas. Quem já assina continua pagando o valor antigo até trocar de plano.
        &quot;IA no máximo&quot; é quanto a IA custa se o cliente usar todos os créditos.
      </p>
      <table className="extrato">
        <thead>
          <tr>
            <th>Plano</th><th>Preço (R$)</th><th>Créditos/mês</th><th>Perfis</th>
            <th style={{ textAlign: "right" }}>IA no máximo</th><th style={{ textAlign: "right" }}>Assinantes</th><th />
          </tr>
        </thead>
        <tbody>
          {dados.planos.map((p) => {
            const e = edicao[p.id];
            const custoMax = Number(e.creditos) * custoCredito;
            const preco = Number(e.preco.replace(",", "."));
            const pct = preco ? (custoMax / preco) * 100 : 0;
            return (
              <tr key={p.id}>
                <td><b>{p.nome}</b>{!p.publico && <span className="ajuda"> · não aparece à venda</span>}</td>
                <td><input type="text" inputMode="decimal" value={e.preco} style={{ width: 90 }} onChange={(ev) => setEdicao((s) => ({ ...s, [p.id]: { ...e, preco: ev.target.value } }))} /></td>
                <td><input type="number" value={e.creditos} style={{ width: 90 }} onChange={(ev) => setEdicao((s) => ({ ...s, [p.id]: { ...e, creditos: ev.target.value } }))} /></td>
                <td><input type="number" value={e.perfis} style={{ width: 64 }} onChange={(ev) => setEdicao((s) => ({ ...s, [p.id]: { ...e, perfis: ev.target.value } }))} /></td>
                <td style={{ textAlign: "right", color: pct > 70 ? "var(--erro)" : pct > 60 ? "var(--alerta)" : undefined }}>
                  {brl(custoMax)}{preco ? ` (${pct.toFixed(0)}%)` : ""}
                </td>
                <td style={{ textAlign: "right" }}>{p.assinantes}{p.receita ? ` · ${brl(p.receita)}` : ""}</td>
                <td><button className="botao sec peq" onClick={() => salvar(p.id)}>Salvar</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="ajuda" style={{ fontSize: 12 }}>
        Referência: deixe a IA no máximo abaixo de ~60% do preço (o resto paga as taxas do Asaas, impostos, servidores e o seu lucro).
        Os outros benefícios de cada plano (modelos, acúmulo, desconto em recargas) ficam no banco, na tabela planos.
      </p>
    </div>
  );
}
