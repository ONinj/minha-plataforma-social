"use client";

import { useEffect, useState } from "react";
import { formatarCreditos } from "@/lib/custo";
import { api } from "@/lib/nuvem";
import { useStore } from "@/lib/store";
import { brl, formatarData } from "@/lib/util";
import Icone from "../Icone";
import ModalFormulario from "../ModalFormulario";
import { beneficios, estimativa } from "@/lib/planos";


const PACOTES = [
  { id: "p100", creditos: 100, valor: 14.9 },
  { id: "p500", creditos: 500, valor: 69.9 },
  { id: "p1500", creditos: 1500, valor: 199.9 },
];

const STATUS: Record<string, { nome: string; cor: string }> = {
  teste: { nome: "Teste grátis", cor: "var(--gemini)" },
  ativo: { nome: "Ativo", cor: "var(--ok)" },
  atrasado: { nome: "Pagamento em aberto", cor: "var(--erro)" },
  cancelado: { nome: "Cancelado", cor: "var(--texto-3)" },
};

type Movimento = { id: number; tipo: string; creditos: number; saldo_apos: number; descricao: string; criado_em: string };

export default function Plano() {
  const store = useStore();
  const n = store.nuvem!;
  const [extrato, setExtrato] = useState<{ usadosNoMes: number; movimentos: Movimento[] } | null>(null);
  const [pedido, setPedido] = useState<{ acao: "assinar" | "recarga"; alvo: string } | null>(null);
  const [aguardando, setAguardando] = useState(false);
  const dono = n.conta.papel === "dono";

  useEffect(() => {
    api<{ usadosNoMes: number; movimentos: Movimento[] }>("/api/extrato").then(setExtrato).catch(() => {});
  }, [n.conta.saldo]);

  // Depois de pagar numa nova aba, confere a conta de tempos em tempos para atualizar o plano.
  useEffect(() => {
    if (!aguardando) return;
    const t = setInterval(() => store.recarregarNuvem(), 8000);
    const fim = setTimeout(() => setAguardando(false), 10 * 60 * 1000);
    return () => {
      clearInterval(t);
      clearTimeout(fim);
    };
  }, [aguardando, store]);

  async function cobrar(acao: "assinar" | "recarga", alvo: string, nome?: string, cpfCnpj?: string) {
    try {
      const corpo = acao === "assinar" ? { acao, plano: alvo, nome, cpfCnpj } : { acao, pacote: alvo, nome, cpfCnpj };
      const { url } = await api<{ url: string | null }>("/api/cobranca", { corpo });
      if (url) window.open(url, "_blank");
      setAguardando(true);
      store.avisar("Abrimos a fatura numa nova aba. Assim que o pagamento for confirmado, seus créditos aparecem aqui.", "info");
    } catch (e) {
      const codigo = (e as { codigo?: string }).codigo;
      if (codigo === "documento") setPedido({ acao, alvo });
      else store.avisar(e instanceof Error ? e.message : String(e), "erro");
    }
  }

  function escolher(acao: "assinar" | "recarga", alvo: string) {
    if (!n.cobranca) {
      store.avisar("A cobrança ainda não foi configurada na plataforma.", "erro");
      return;
    }
    if (!n.conta.asaas_cliente) setPedido({ acao, alvo });
    else cobrar(acao, alvo);
  }

  const st = STATUS[n.conta.status] ?? STATUS.ativo;
  const proporcao = n.plano.creditos_mensais ? Math.min(100, (n.conta.saldo / n.plano.creditos_mensais) * 100) : 0;
  const zap = n.whatsapp ? `https://wa.me/${n.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Olá! Quero saber do plano Empresa da Galhos.")}` : null;

  return (
    <div className="conteudo">
      <div className="grade-3" style={{ marginBottom: 20 }}>
        <div className="cartao">
          <h3>
            <Icone nome="carteira" /> Saldo de créditos
          </h3>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.03em" }}>{formatarCreditos(n.conta.saldo)}</div>
          {n.plano.creditos_mensais > 0 && (
            <div className={`barra ${proporcao < 20 ? "alerta" : ""}`} style={{ margin: "10px 0 6px" }}>
              <div style={{ width: `${proporcao}%` }} />
            </div>
          )}
          <p className="ajuda" style={{ margin: 0 }}>
            1 crédito = R$ 0,10 de uso de IA.{extrato ? ` Usados este mês: ${formatarCreditos(extrato.usadosNoMes)}.` : ""}
          </p>
        </div>
        <div className="cartao">
          <h3>
            <Icone nome="estrela" /> Plano atual
          </h3>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{n.plano.nome}</div>
          <p className="ajuda" style={{ margin: "4px 0" }}>
            <span style={{ color: st.cor }}>● {st.nome}</span>
            {n.plano.creditos_mensais ? ` · ${formatarCreditos(n.plano.creditos_mensais)} créditos/mês` : ""}
            {n.conta.renova_em ? ` · renova em ${formatarData(n.conta.renova_em).split(",")[0]}` : ""}
          </p>
          {n.conta.plano_pendente && (
            <p className="ajuda" style={{ color: "var(--alerta)" }}>
              Aguardando o pagamento para mudar para o plano {n.planos.find((p) => p.id === n.conta.plano_pendente)?.nome}.
            </p>
          )}
          {dono && n.conta.asaas_assinatura && n.conta.status !== "cancelado" && (
            <button
              className="botao perigo peq"
              onClick={async () => {
                if (!window.confirm("Cancelar a assinatura? Os créditos que sobraram continuam valendo até acabar.")) return;
                await api("/api/cobranca", { corpo: { acao: "cancelar" } }).catch((e) => store.avisar(String(e.message), "erro"));
                store.recarregarNuvem();
              }}
            >
              Cancelar assinatura
            </button>
          )}
        </div>
        <div className="cartao">
          <h3>
            <Icone nome="raio" /> Recarga avulsa
          </h3>
          <p className="ajuda" style={{ marginTop: -4 }}>
            Créditos extras que não vencem.
            {n.recursos.desconto_recarga ? ` Seu plano tem ${Math.round(n.recursos.desconto_recarga * 100)}% de desconto.` : ""}
          </p>
          <div className="lista" style={{ gap: 8 }}>
            {PACOTES.map((p) => (
              <button
                key={p.id}
                className="botao sec"
                style={{ justifyContent: "space-between" }}
                disabled={!dono || n.conta.plano_id === "teste"}
                title={n.conta.plano_id === "teste" ? "Escolha um plano antes de comprar recargas" : ""}
                onClick={() => escolher("recarga", p.id)}
              >
                <span>{formatarCreditos(p.creditos)} créditos</span>
                <span>
                  {!!n.recursos.desconto_recarga && (
                    <s style={{ color: "var(--texto-3)", fontSize: 12, marginRight: 6 }}>{brl(p.valor)}</s>
                  )}
                  <b>{brl(Math.round(p.valor * (1 - (n.recursos.desconto_recarga ?? 0)) * 100) / 100)}</b>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <h3 style={{ margin: "0 0 12px" }}>Planos</h3>
      <div className="planos" style={{ marginBottom: 24 }}>
        {n.planos.map((p) => {
          const r = p.recursos;
          const atual = p.id === n.plano.id;
          return (
            <div key={p.id} className={`plano ${atual ? "atual" : ""} ${p.id === "profissional" ? "destaque" : ""}`}>
              <b style={{ fontSize: 16 }}>{p.nome}</b>
              <div className="preco">
                {brl(p.preco)}
                <small>/mês</small>
              </div>
              <span className="etiqueta">{formatarCreditos(p.creditos_mensais)} créditos por mês</span>
              <span className="ajuda">{estimativa(n, p.creditos_mensais)}</span>
              <ul>
                {beneficios(r).map((b) => (
                  <li key={b.texto} className={b.tem ? "" : "nao"}>
                    {b.texto}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: "auto" }}>
                {atual && n.conta.status !== "cancelado" ? (
                  <button className="botao sec" style={{ width: "100%" }} disabled>
                    Plano atual
                  </button>
                ) : (
                  <button className="botao" style={{ width: "100%" }} disabled={!dono} onClick={() => escolher("assinar", p.id)}>
                    {n.plano.preco && p.preco < n.plano.preco ? "Mudar para este" : "Assinar"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div className="plano">
          <b style={{ fontSize: 16 }}>Empresa</b>
          <div className="preco" style={{ fontSize: 22 }}>Sob consulta</div>
          <span className="ajuda">Créditos, perfis e equipe sob medida para empresas e agências.</span>
          <ul>
            <li>Dezenas de perfis de clientes</li>
            <li>Todas as IAs no máximo</li>
            <li>Créditos e valor combinados</li>
            <li>Publicação automática no Instagram</li>
            <li>Maior desconto nas recargas</li>
            <li>Atendimento dedicado</li>
          </ul>
          <div style={{ marginTop: "auto" }}>
            {zap ? (
              <a className="botao" style={{ width: "100%", textDecoration: "none" }} href={zap} target="_blank" rel="noreferrer">
                Falar no WhatsApp
              </a>
            ) : (
              <button className="botao sec" style={{ width: "100%" }} disabled>
                Fale com a equipe
              </button>
            )}
          </div>
        </div>
      </div>
      {!dono && <p className="ajuda">Só o dono da conta pode mudar o plano ou comprar recargas.</p>}

      <div className="cartao">
        <h3>
          <Icone nome="relogio" /> Extrato de créditos
        </h3>
        {!extrato ? (
          <div className="girando" />
        ) : extrato.movimentos.length === 0 ? (
          <p className="ajuda">Nenhum movimento ainda.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="extrato">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th style={{ textAlign: "right" }}>Créditos</th>
                  <th style={{ textAlign: "right" }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {extrato.movimentos.map((m) => (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: "nowrap", color: "var(--texto-3)" }}>{formatarData(m.criado_em)}</td>
                    <td>{m.descricao}</td>
                    <td style={{ textAlign: "right" }} className={m.creditos > 0 ? "mais" : "menos"}>
                      {m.creditos > 0 ? "+" : ""}
                      {formatarCreditos(m.creditos)}
                    </td>
                    <td style={{ textAlign: "right" }}>{formatarCreditos(m.saldo_apos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pedido && (
        <ModalFormulario
          titulo="Dados para a cobrança"
          descricao="O emissor da cobrança pede nome e CPF ou CNPJ. Você escolhe Pix, boleto ou cartão na fatura."
          campos={[
            { nome: "nome", rotulo: "Nome ou razão social", padrao: n.conta.nome },
            { nome: "doc", rotulo: "CPF ou CNPJ", placeholder: "Só números" },
          ]}
          rotuloSalvar="Ir para o pagamento"
          aoSalvar={(v) => cobrar(pedido.acao, pedido.alvo, v.nome, v.doc)}
          aoFechar={() => setPedido(null)}
        />
      )}
    </div>
  );
}
