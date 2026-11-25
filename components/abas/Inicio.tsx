"use client";

import { totalMes, useStore } from "@/lib/store";
import { brl } from "@/lib/util";
import type { IdAba } from "../App";
import Icone, { Avatar } from "../Icone";
import { CartaoMidia } from "../MidiaView";

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export default function Inicio({ ir, falarComGerente }: { ir: (a: IdAba) => void; falarComGerente: (t: string) => void }) {
  const { estado, conta, marca, trocarMarca, ocupado } = useStore();
  const agora = new Date();
  const em7 = new Date(agora.getTime() + 7 * 864e5);
  const proximos = estado.agendamentos
    .filter((a) => a.status !== "cancelado" && a.status !== "postado" && new Date(a.data) >= new Date(agora.toDateString()))
    .sort((a, b) => a.data.localeCompare(b.data));
  const semana = proximos.filter((a) => new Date(a.data) <= em7).length;
  const pendentes = estado.aprovacoes.filter((a) => a.status === "pendente").length;
  const gerando = estado.midias.filter((m) => m.status === "gerando").length;
  const gasto = totalMes(marca.gastos) * conta.config.cambio;
  const recentes = estado.midias.filter((m) => m.status === "pronto" && !m.naBiblioteca).slice(0, 8);
  const ideiasAbertas = estado.ideias.filter((i) => !i.feita).slice(0, 4);
  const mesQueVem = new Date(agora.getFullYear(), agora.getMonth() + 1, 1).toLocaleDateString("pt-BR", { month: "long" });

  const estat = [
    { rotulo: "Esperando aprovação", valor: pendentes, icone: "aprovar", cor: "var(--alerta)", aba: "aprovacoes" as IdAba },
    { rotulo: "Posts nos próximos 7 dias", valor: semana, icone: "calendario", cor: "var(--gemini)", aba: "agendamentos" as IdAba },
    { rotulo: "Vídeos em produção", valor: gerando, icone: "video", cor: "var(--veo)", aba: "midias" as IdAba },
    { rotulo: "Gasto do perfil no mês", valor: brl(gasto), icone: "carteira", cor: "var(--destaque-2)", aba: "config" as IdAba },
  ];

  const acoes = [
    { titulo: `Planejar ${mesQueVem}`, sub: "Calendário completo com o gerente", icone: "calendario", fazer: () => falarComGerente(`Monte o planejamento de ${mesQueVem} para este perfil e envie para aprovação.`) },
    { titulo: "Animar uma foto", sub: "Envie a foto e peça o vídeo", icone: "video", fazer: () => ir("midias") },
    { titulo: "Criar um card", sub: "Imagem com o Nano Banana 2", icone: "imagem", fazer: () => ir("gemini") },
    { titulo: "Anotar ideia", sub: "Guarde para depois", icone: "ideia", fazer: () => ir("ideias") },
  ];

  return (
    <div className="conteudo">
      <div className="linha" style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <p className="ajuda" style={{ margin: 0 }}>
            {saudacao()}
            {conta.nome && conta.nome !== "Minha conta" ? `, ${conta.nome.split(" ")[0]}` : ""} 👋
          </p>
          <h2 className="titulo-pagina">
            Trabalhando em <span className="gradiente-texto">{marca.nome}</span>
          </h2>
          <p className="ajuda" style={{ margin: 0 }}>
            {marca.arroba ? `@${marca.arroba} · ` : ""}
            {agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <button className="botao" onClick={() => ir("central")}>
          <Icone nome="central" /> Falar com o gerente
        </button>
      </div>

      {!marca.perfil.trim() && (
        <div className="cartao" style={{ marginTop: 18, borderColor: "rgba(245,158,11,.4)" }}>
          <div className="linha" style={{ justifyContent: "space-between" }}>
            <span className="ajuda" style={{ color: "var(--texto)" }}>
              ✍️ Descreva este perfil (nicho, público, tom de voz) para o gerente acertar o estilo de primeira.
            </span>
            <button className="botao sec peq" onClick={() => ir("perfis")}>
              Preencher perfil
            </button>
          </div>
        </div>
      )}

      <div className="estatisticas">
        {estat.map((e) => (
          <button key={e.rotulo} className="estat" onClick={() => ir(e.aba)}>
            <div className="icone" style={{ background: `color-mix(in srgb, ${e.cor} 18%, transparent)`, color: e.cor }}>
              <Icone nome={e.icone} />
            </div>
            <strong>{e.valor}</strong>
            <span>{e.rotulo}</span>
          </button>
        ))}
      </div>

      <div className="acoes-rapidas">
        {acoes.map((a) => (
          <button key={a.titulo} className="acao-rapida" onClick={a.fazer}>
            <span className="icone">
              <Icone nome={a.icone} />
            </span>
            <span>
              <b>{a.titulo}</b>
              <span>{a.sub}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="grade-3">
        <div className="cartao">
          <h3>
            <Icone nome="relogio" /> Próximas publicações
          </h3>
          {proximos.length === 0 ? (
            <p className="ajuda">Nada no calendário ainda.</p>
          ) : (
            <div className="proximos">
              {proximos.slice(0, 5).map((a) => {
                const d = new Date(a.data);
                return (
                  <div key={a.id} className="proximo">
                    <div className="data">
                      <b>{d.getDate()}</b>
                      {d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.titulo}</div>
                      <span className="ajuda">
                        {a.data.slice(11, 16)} · {a.tipo} · <span className={`status-${a.status}`}>{a.status === "a_programar" ? "a programar" : a.status}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button className="botao sec peq" style={{ marginTop: 12 }} onClick={() => ir("agendamentos")}>
            Abrir calendário
          </button>
        </div>

        <div className="cartao">
          <h3>
            <Icone nome="imagem" /> Últimas criações
          </h3>
          {recentes.length === 0 ? (
            <p className="ajuda">As imagens e vídeos criados aparecem aqui.</p>
          ) : (
            <div className="faixa-midias">
              {recentes.map((m) => (
                <CartaoMidia key={m.id} midia={m} mini />
              ))}
            </div>
          )}
          <button className="botao sec peq" style={{ marginTop: 12 }} onClick={() => ir("midias")}>
            Ver biblioteca
          </button>
        </div>

        <div className="cartao">
          <h3>
            <Icone nome="perfis" /> Perfis desta conta
          </h3>
          <div className="lista" style={{ gap: 8 }}>
            {conta.marcas.map((m) => {
              const pend = m.aprovacoes.filter((a) => a.status === "pendente").length;
              return (
                <button
                  key={m.id}
                  className={`perfil-cartao ${m.id === marca.id ? "ativo" : ""}`}
                  disabled={ocupado}
                  onClick={() => trocarMarca(m.id)}
                >
                  <Avatar nome={m.nome} cor={m.cor} tamanho={34} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <b style={{ display: "block" }}>{m.nome}</b>
                    <span className="ajuda">{pend ? `${pend} esperando aprovação` : "em dia"}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {ideiasAbertas.length > 0 && (
            <>
              <h3 style={{ marginTop: 18 }}>
                <Icone nome="ideia" /> Ideias anotadas
              </h3>
              {ideiasAbertas.map((i) => (
                <p key={i.id} className="ajuda" style={{ margin: "6px 0" }}>
                  • {i.texto.length > 90 ? `${i.texto.slice(0, 90)}…` : i.texto}
                </p>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
