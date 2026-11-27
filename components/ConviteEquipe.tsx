"use client";

import { useEffect, useState } from "react";
import { MODO_NUVEM, supabase } from "@/lib/nuvem";
import Login from "./Login";
import Logo from "./Logo";

/** Página do convite: a pessoa entra (ou cria a conta) com o e-mail convidado e aceita. */
export default function ConviteEquipe({ token }: { token: string }) {
  const [info, setInfo] = useState<{ conta: string; email: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sessao, setSessao] = useState<{ email: string; token: string } | null | undefined>(undefined);
  const [login, setLogin] = useState<null | "entrar" | "criar">(null);
  const [aceitando, setAceitando] = useState(false);

  useEffect(() => {
    fetch(`/api/convite/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Convite inválido.");
        setInfo(j);
      })
      .catch((e) => setErro(e.message));
    if (!MODO_NUVEM) return;
    const sb = supabase();
    const atualizar = (s: { user?: { email?: string }; access_token?: string } | null) =>
      setSessao(s?.access_token ? { email: s.user?.email ?? "", token: s.access_token } : null);
    sb.auth.getSession().then(({ data }) => atualizar(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => {
      atualizar(s);
      if (s) setLogin(null);
    });
    return () => data.subscription.unsubscribe();
  }, [token]);

  async function aceitar() {
    if (!sessao) return;
    setAceitando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/convite/${encodeURIComponent(token)}`, { method: "POST", headers: { Authorization: `Bearer ${sessao.token}` } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Não consegui aceitar o convite.");
      try {
        localStorage.setItem("conta-ativa", j.conta);
      } catch {}
      window.location.href = "/";
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setAceitando(false);
    }
  }

  if (login) return <Login modoInicial={login} aoVoltar={() => setLogin(null)} voltarPara={typeof window !== "undefined" ? window.location.href : undefined} />;

  return (
    <div className="tela-login">
      <div className="login-caixa" style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Logo tamanho={44} />
        </div>
        {!info && !erro && <div className="girando" style={{ margin: "20px auto" }} />}
        {info && (
          <>
            <h2 className="titulo-pagina">Convite para a equipe</h2>
            <p className="ajuda">
              Você foi convidado para trabalhar na conta <b style={{ color: "var(--texto)" }}>{info.conta}</b> da Galhos.
              <br />O convite é para o e-mail <b style={{ color: "var(--texto)" }}>{info.email}</b>.
            </p>
            {sessao === undefined ? (
              <div className="girando" style={{ margin: "10px auto" }} />
            ) : sessao ? (
              <>
                <p className="ajuda">Você entrou como <b style={{ color: "var(--texto)" }}>{sessao.email}</b>.</p>
                <button className="botao" style={{ width: "100%", padding: 12 }} disabled={aceitando} onClick={aceitar}>
                  {aceitando ? "Entrando na equipe..." : "Aceitar e entrar na equipe"}
                </button>
                <button className="link-botao" style={{ marginTop: 10 }} onClick={() => supabase().auth.signOut()}>
                  Não é você? Entrar com outro e-mail
                </button>
              </>
            ) : (
              <div className="lista" style={{ gap: 8 }}>
                <button className="botao" style={{ padding: 12, justifyContent: "center" }} onClick={() => setLogin("criar")}>
                  Criar minha conta
                </button>
                <button className="botao sec" style={{ padding: 12, justifyContent: "center" }} onClick={() => setLogin("entrar")}>
                  Já tenho conta: entrar
                </button>
              </div>
            )}
          </>
        )}
        {erro && <div className="erro-msg" style={{ marginTop: 12 }}>{erro}</div>}
      </div>
    </div>
  );
}
