"use client";

import { useEffect, useState } from "react";
import { atualizarConexoes, useCota, useInstagram } from "@/lib/instagram";
import { api } from "@/lib/nuvem";
import { useStore } from "@/lib/store";
import { linkSeguro } from "@/lib/util";
import Icone from "./Icone";

/** Configurações → "Meu próprio Metricool": quem já assina o Metricool Advanced liga o dele. */
export function MetricoolProprio() {
  const store = useStore();
  const ig = useInstagram(store);
  const [userId, setUserId] = useState("");
  const [token, setToken] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const n = store.nuvem;
  if (!n) return null;
  const dono = n.conta.papel === "dono";
  const mc = ig.metricool;

  async function salvar() {
    setOcupado(true);
    try {
      const r = await api<{ marcas: unknown[] }>("/api/metricool", { corpo: { acao: "credenciais", userId, token } });
      setToken("");
      await atualizarConexoes();
      store.avisar(`Metricool conectado! ${r.marcas.length} marca(s) encontrada(s). Agora escolha a marca de cada perfil em Perfis e redes.`, "ok");
    } catch (e) {
      store.avisar(e instanceof Error ? e.message : String(e), "erro");
    } finally {
      setOcupado(false);
    }
  }

  async function remover() {
    if (!window.confirm("Desligar o seu Metricool? As publicações já agendadas lá continuam no Metricool.")) return;
    setOcupado(true);
    await api("/api/metricool", { corpo: { acao: "remover-credenciais" } }).catch((e) => store.avisar(String(e.message), "erro"));
    await atualizarConexoes();
    setOcupado(false);
  }

  return (
    <div className="cartao" style={{ marginBottom: 18 }}>
      <h3>
        <Icone nome="instagram" /> Meu próprio Metricool (opcional)
      </h3>
      <p className="ajuda" style={{ marginTop: -4 }}>
        Se você já assina o <b>Metricool Advanced</b>, pode publicar pelo seu Metricool. Os dados ficam em
        Metricool → Configurações da conta → <b>API</b>: o <b>userId</b> e o <b>token</b> (X-Mc-Auth).
      </p>
      {!mc ? (
        <p className="ajuda">Carregando...</p>
      ) : mc.propria ? (
        <div className="linha" style={{ justifyContent: "space-between" }}>
          <span>
            ✅ Seu Metricool está ligado ({mc.disponiveis.length} marca(s)).
            {mc.erro && <span className="erro-msg" style={{ display: "block" }}>{mc.erro}</span>}
          </span>
          {dono && (
            <button className="botao perigo peq" disabled={ocupado} onClick={remover}>
              Desligar
            </button>
          )}
        </div>
      ) : !dono ? (
        <p className="ajuda">Só o dono da conta pode ligar um Metricool.</p>
      ) : !n.criptoConfigurada ? (
        <p className="ajuda">Ainda indisponível: a equipe da plataforma precisa terminar a configuração de segurança.</p>
      ) : (
        <>
          <div className="grade-2">
            <div className="campo">
              <label>userId</label>
              <input type="text" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="ex.: 1234567" />
            </div>
            <div className="campo">
              <label>Token da API</label>
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
            </div>
          </div>
          <button className="botao" disabled={ocupado || !userId.trim() || !token.trim()} onClick={salvar}>
            {ocupado ? "Conferindo..." : "Ligar meu Metricool"}
          </button>
          <p className="ajuda" style={{ fontSize: 12 }}>O token fica guardado criptografado e nunca aparece de novo na tela.</p>
        </>
      )}
    </div>
  );
}

/** Perfis e redes → cartão de publicação automática pelo Metricool (aparece só quando há Metricool). */
export function CartaoMetricool() {
  const store = useStore();
  const ig = useInstagram(store);
  const [ocupado, setOcupado] = useState(false);
  const mc = ig.metricool;
  const dono = store.nuvem?.conta.papel === "dono";
  const marca = ig.marca;

  async function escolher(blogId: string) {
    setOcupado(true);
    try {
      if (blogId) await api("/api/metricool", { corpo: { acao: "marca", perfil: store.marca.id, blogId } });
      else await api("/api/metricool", { corpo: { acao: "remover-marca", perfil: store.marca.id } });
      await atualizarConexoes();
    } catch (e) {
      store.avisar(e instanceof Error ? e.message : String(e), "erro");
    } finally {
      setOcupado(false);
    }
  }

  // Metricool próprio: o dono escolhe qual marca dele corresponde a este perfil.
  if (mc?.propria) {
    const atual = marca?.origem === "propria" ? marca.blog_id : "";
    const redes = mc.disponiveis.find((d) => d.blogId === atual)?.redes ?? {};
    return (
      <>
        <p className="ajuda" style={{ marginTop: -4 }}>Publicando pelo <b>seu Metricool</b>. Escolha a marca deste perfil:</p>
        <div className="linha">
          <select value={atual} disabled={!dono || ocupado} onChange={(e) => escolher(e.target.value)} style={{ maxWidth: 320 }}>
            <option value="">— nenhuma (não publicar sozinho) —</option>
            {mc.disponiveis.map((d) => (
              <option key={d.blogId} value={d.blogId}>{d.nome}</option>
            ))}
          </select>
        </div>
        {atual && (
          <p className="ajuda" style={{ fontSize: 12 }}>
            {redes.instagram ? `✅ Instagram conectado (@${redes.instagram}).` : "⚠️ Essa marca ainda não tem Instagram conectado no Metricool."}
            {" "}As redes marcadas em cada post (Instagram, Facebook, TikTok...) saem juntas.
          </p>
        )}
      </>
    );
  }

  // Metricool da plataforma.
  if (marca?.origem === "plataforma") {
    return (
      <>
        <p style={{ margin: "0 0 8px" }}>
          ✅ Pronto para publicar sozinho {marca.nome ? <>(marca <b>{marca.nome}</b>)</> : null}.
        </p>
        <p className="ajuda" style={{ fontSize: 12 }}>
          No calendário, ative &quot;Publicar automaticamente&quot; em cada post. As redes marcadas no post saem juntas.
        </p>
        <LinhaCota />
        {linkSeguro(marca.link_conexao) && (
          <a className="botao sec peq" href={linkSeguro(marca.link_conexao)} target="_blank" rel="noreferrer">
            <Icone nome="instagram" tamanho={15} /> Conectar / reconectar minhas redes
          </a>
        )}
      </>
    );
  }
  return (
    <p className="ajuda">
      A equipe da plataforma está preparando a publicação deste perfil. Você vai receber um link para conectar o Instagram (leva 1 minuto).
    </p>
  );
}

type Linha = { id: string; nome: string | null; arroba: string | null };
type Mapa = { perfil_id: string; blog_id: string; nome: string | null; origem: string; link_conexao: string | null };

/** Administração → conta → qual marca do Metricool da plataforma publica cada perfil. */
export function AdminMetricool({ conta }: { conta: string }) {
  const store = useStore();
  const [dados, setDados] = useState<{ perfis: Linha[]; mapa: Mapa[]; marcas: { blogId: string; nome: string; redes: Record<string, string> }[]; erro: string | null } | null>(null);
  const [edicao, setEdicao] = useState<Record<string, { blogId: string; link: string }>>({});

  useEffect(() => {
    api<NonNullable<typeof dados>>(`/api/admin/metricool?conta=${conta}`)
      .then((d) => {
        setDados(d);
        setEdicao(Object.fromEntries(d.mapa.filter((m) => m.origem === "plataforma").map((m) => [m.perfil_id, { blogId: m.blog_id, link: m.link_conexao ?? "" }])));
      })
      .catch((e) => store.avisar(String(e.message), "erro"));
  }, [conta, store]);

  if (!dados) return <p className="ajuda">Carregando Metricool...</p>;

  async function salvar(perfil: string) {
    const e = edicao[perfil] ?? { blogId: "", link: "" };
    const m = dados!.marcas.find((x) => x.blogId === e.blogId);
    try {
      await api("/api/admin/metricool", { corpo: { conta, perfil, blogId: e.blogId || undefined, nome: m?.nome, link: e.link } });
      store.avisar("Metricool do perfil salvo.", "ok");
    } catch (err) {
      store.avisar(err instanceof Error ? err.message : String(err), "erro");
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <h4 style={{ margin: "0 0 6px" }}>Metricool (publicação automática)</h4>
      {dados.erro && <p className="ajuda">⚠️ {dados.erro}</p>}
      {dados.perfis.length === 0 && <p className="ajuda">Esta conta ainda não tem perfis.</p>}
      {dados.perfis.map((p) => {
        const propria = dados.mapa.find((m) => m.perfil_id === p.id && m.origem === "propria");
        const e = edicao[p.id] ?? { blogId: "", link: "" };
        const redes = dados.marcas.find((m) => m.blogId === e.blogId)?.redes ?? {};
        return (
          <div key={p.id} className="cartao" style={{ padding: 10, marginBottom: 8 }}>
            <b>{p.nome || "Perfil sem nome"}</b> {p.arroba && <span className="ajuda">@{p.arroba.replace(/^@/, "")}</span>}
            {propria ? (
              <p className="ajuda" style={{ margin: "4px 0 0" }}>Usa o Metricool próprio do cliente ({propria.nome}).</p>
            ) : (
              <div className="grade-2" style={{ marginTop: 6 }}>
                <div className="campo">
                  <label>Marca no Metricool</label>
                  <select value={e.blogId} disabled={!dados.marcas.length} onChange={(ev) => setEdicao((s) => ({ ...s, [p.id]: { ...e, blogId: ev.target.value } }))}>
                    <option value="">— nenhuma —</option>
                    {dados.marcas.map((m) => (
                      <option key={m.blogId} value={m.blogId}>{m.nome}{m.redes.instagram ? ` (@${m.redes.instagram})` : ""}</option>
                    ))}
                  </select>
                  {e.blogId && !redes.instagram && <span className="ajuda" style={{ fontSize: 12 }}>⚠️ Instagram ainda não conectado nessa marca.</span>}
                </div>
                <div className="campo">
                  <label>Link de conexão para o cliente (opcional)</label>
                  <input type="url" value={e.link} placeholder="https://app.metricool.com/..." onChange={(ev) => setEdicao((s) => ({ ...s, [p.id]: { ...e, link: ev.target.value } }))} />
                </div>
                <button className="botao peq" onClick={() => salvar(p.id)}>Salvar</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** "Este mês: 2/4 reels · 3/8 stories · 1/4 posts" — uso do limite de publicação automática do perfil. */
export function LinhaCota() {
  const store = useStore();
  const cota = useCota(store);
  if (!cota?.limites) return null;
  const l = cota.limites;
  return (
    <div className="ajuda" style={{ fontSize: 12.5, marginTop: 8 }}>
      <b>Publicação automática do seu plano</b> (renova todo mês):
      {cota.meses.slice(0, 2).map((m) => (
        <div key={m.mes}>
          {m.nome}: {m.usados.reels}/{l.reels} reels · {m.usados.stories}/{l.stories} stories · {m.usados.posts}/{l.posts} posts
        </div>
      ))}
    </div>
  );
}
