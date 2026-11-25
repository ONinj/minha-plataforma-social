"use client";

import { useState } from "react";
import { supabase } from "@/lib/nuvem";
import Icone from "./Icone";

/** Tela de entrada: link mágico por e-mail ou conta Google. */
export default function Login() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  async function entrarComEmail(e: React.FormEvent) {
    e.preventDefault();
    setErro(undefined);
    setEnviando(true);
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setEnviando(false);
    if (error) setErro(error.message);
    else setEnviado(true);
  }

  async function entrarComGoogle() {
    setErro(undefined);
    const { error } = await supabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) setErro(error.message);
  }

  return (
    <div className="tela-login">
      <div className="login-caixa">
        <div className="logo" style={{ justifyContent: "center", padding: 0, marginBottom: 18 }}>
          <span className="logo-marca">
            <Icone nome="raio" tamanho={16} />
          </span>
          <div>
            Central Social
            <small>Estúdio de conteúdo com IA</small>
          </div>
        </div>
        <h2 className="titulo-pagina" style={{ textAlign: "center" }}>
          Entre na sua conta
        </h2>
        <p className="ajuda" style={{ textAlign: "center", marginTop: 0 }}>
          Planeje, crie imagens e vídeos com IA e organize as redes dos seus clientes num lugar só.
        </p>
        {enviado ? (
          <div className="cartao" style={{ textAlign: "center" }}>
            <h3 style={{ justifyContent: "center" }}>📬 Confira seu e-mail</h3>
            <p className="ajuda">
              Mandamos um link de acesso para <b>{email}</b>. Abra o e-mail neste mesmo navegador e clique no link.
            </p>
            <button className="botao sec" onClick={() => setEnviado(false)}>
              Usar outro e-mail
            </button>
          </div>
        ) : (
          <>
            <button className="botao sec" style={{ width: "100%", padding: 12 }} onClick={entrarComGoogle}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
              </svg>
              Entrar com Google
            </button>
            <div className="linha" style={{ margin: "16px 0", color: "var(--texto-3)", fontSize: 12 }}>
              <span style={{ flex: 1, height: 1, background: "var(--borda)" }} /> ou <span style={{ flex: 1, height: 1, background: "var(--borda)" }} />
            </div>
            <form onSubmit={entrarComEmail}>
              <div className="campo">
                <label>E-mail</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" />
              </div>
              <button className="botao" style={{ width: "100%", padding: 12 }} disabled={enviando || !email.includes("@")}>
                {enviando ? "Enviando..." : "Receber link de acesso"}
              </button>
            </form>
          </>
        )}
        {erro && <div className="erro-msg">{erro}</div>}
        <p className="ajuda" style={{ textAlign: "center", fontSize: 12, marginTop: 18 }}>
          Contas novas começam com créditos de teste grátis.
        </p>
      </div>
    </div>
  );
}
