"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/nuvem";
import { urlSupabase } from "@/lib/supabaseUrl";
import Logo from "./Logo";

type Modo = "entrar" | "criar" | "link" | "esqueci";

/** Traduz as mensagens do Supabase para algo que qualquer pessoa entenda. */
export function traduzirErro(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos. Se você sempre entrou pelo link do e-mail, use “Esqueci minha senha” para criar uma.";
  if (m.includes("email not confirmed")) return "Falta confirmar o e-mail: abra a mensagem que enviamos e clique no link.";
  if (m.includes("already registered") || m.includes("already exists")) return "Esse e-mail já tem conta. Use “Entrar” (ou “Esqueci minha senha”).";
  if (m.includes("at least") && m.includes("characters")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("weak") || m.includes("pwned")) return "Essa senha é fraca ou conhecida demais. Escolha outra.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes")) return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  if (m.includes("provider is not enabled") || m.includes("unsupported provider")) return "O login com Google ainda não foi ligado pela equipe da plataforma.";
  if (m.includes("signups not allowed")) return "Cadastros novos estão desligados no momento.";
  if (m.includes("same") && m.includes("password")) return "A nova senha precisa ser diferente da anterior.";
  return msg;
}

/** Quais formas de login o Supabase tem ligadas (o botão do Google só aparece se estiver ligado). */
function useConfiguracaoLogin() {
  const [cfg, setCfg] = useState<{ google: boolean; confirmaEmail: boolean } | null>(null);
  useEffect(() => {
    fetch(`${urlSupabase()}/auth/v1/settings`, { headers: { apikey: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim() } })
      .then((r) => r.json())
      .then((j: { external?: Record<string, boolean>; mailer_autoconfirm?: boolean }) =>
        setCfg({ google: !!j.external?.google, confirmaEmail: !j.mailer_autoconfirm }),
      )
      .catch(() => setCfg({ google: false, confirmaEmail: true }));
  }, []);
  return cfg;
}

/** Tela de entrada: e-mail e senha, link por e-mail (sem senha) ou Google. */
export default function Login({ modoInicial = "entrar", aoVoltar }: { modoInicial?: "entrar" | "criar"; aoVoltar?: () => void } = {}) {
  const cfg = useConfiguracaoLogin();
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null);
  const [erro, setErro] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  function trocar(m: Modo) {
    setModo(m);
    setErro(undefined);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(undefined);
    setEnviando(true);
    const sb = supabase().auth;
    const em = email.trim();
    try {
      if (modo === "entrar") {
        const { error } = await sb.signInWithPassword({ email: em, password: senha });
        if (error) throw error;
        // Deu certo: a plataforma abre sozinha.
      } else if (modo === "criar") {
        const { data, error } = await sb.signUp({ email: em, password: senha, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) {
          setAviso({
            titulo: "📬 Confirme seu e-mail",
            texto: `Mandamos um link para ${em}. Clique nele para ativar a conta (é só desta vez). Se esse e-mail já tinha conta, use “Entrar”.`,
          });
        }
      } else if (modo === "link") {
        const { error } = await sb.signInWithOtp({ email: em, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        setAviso({ titulo: "📬 Confira seu e-mail", texto: `Mandamos um link de acesso para ${em}. Abra o e-mail neste mesmo aparelho e clique no link.` });
      } else {
        const { error } = await sb.resetPasswordForEmail(em, { redirectTo: `${window.location.origin}/?nova-senha=1` });
        if (error) throw error;
        setAviso({ titulo: "📬 Confira seu e-mail", texto: `Se ${em} tiver conta, chega um link para você criar uma senha nova.` });
      }
    } catch (e) {
      setErro(traduzirErro(e instanceof Error ? e.message : String(e)));
    } finally {
      setEnviando(false);
    }
  }

  async function entrarComGoogle() {
    setErro(undefined);
    const { error } = await supabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) setErro(traduzirErro(error.message));
  }

  const precisaSenha = modo === "entrar" || modo === "criar";
  const textoBotao = {
    entrar: enviando ? "Entrando..." : "Entrar",
    criar: enviando ? "Criando..." : "Criar conta grátis",
    link: enviando ? "Enviando..." : "Receber link de acesso",
    esqueci: enviando ? "Enviando..." : "Enviar link para criar nova senha",
  }[modo];

  return (
    <div className="tela-login">
      <div className="login-caixa">
        {aoVoltar && (
          <button className="link-botao" style={{ marginBottom: 10, fontSize: 13 }} onClick={aoVoltar}>
            ← Voltar
          </button>
        )}
        <div className="logo" style={{ justifyContent: "center", padding: 0, marginBottom: 18 }}>
          <Logo tamanho={30} />
          <div>
            Galhos
            <small>Estúdio de conteúdo com IA</small>
          </div>
        </div>
        <h2 className="titulo-pagina" style={{ textAlign: "center" }}>
          {modo === "criar" ? "Crie sua conta" : modo === "esqueci" ? "Esqueci minha senha" : "Entre na sua conta"}
        </h2>
        <p className="ajuda" style={{ textAlign: "center", marginTop: 0 }}>
          Planeje, crie imagens e vídeos com IA e organize as redes dos seus clientes num lugar só.
        </p>
        {aviso ? (
          <div className="cartao" style={{ textAlign: "center" }}>
            <h3 style={{ justifyContent: "center" }}>{aviso.titulo}</h3>
            <p className="ajuda">{aviso.texto}</p>
            <button
              className="botao sec"
              onClick={() => {
                setAviso(null);
                trocar("entrar");
              }}
            >
              Voltar
            </button>
          </div>
        ) : (
          <>
            {(modo === "entrar" || modo === "criar") && (
              <div className="filtros" style={{ justifyContent: "center", marginBottom: 14 }}>
                <button className={`filtro ${modo === "entrar" ? "ativo" : ""}`} onClick={() => trocar("entrar")}>
                  Entrar
                </button>
                <button className={`filtro ${modo === "criar" ? "ativo" : ""}`} onClick={() => trocar("criar")}>
                  Criar conta
                </button>
              </div>
            )}
            {cfg?.google && precisaSenha && (
              <>
                <button className="botao sec" style={{ width: "100%", padding: 12 }} onClick={entrarComGoogle}>
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
                    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
                  </svg>
                  {modo === "criar" ? "Criar conta com Google" : "Entrar com Google"}
                </button>
                <div className="linha" style={{ margin: "16px 0", color: "var(--texto-3)", fontSize: 12 }}>
                  <span style={{ flex: 1, height: 1, background: "var(--borda)" }} /> ou <span style={{ flex: 1, height: 1, background: "var(--borda)" }} />
                </div>
              </>
            )}
            <form onSubmit={enviar}>
              <div className="campo">
                <label>E-mail</label>
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" />
              </div>
              {precisaSenha && (
                <div className="campo">
                  <label>{modo === "criar" ? "Crie uma senha (mínimo 6 caracteres)" : "Senha"}</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete={modo === "criar" ? "new-password" : "current-password"}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                </div>
              )}
              <button className="botao" style={{ width: "100%", padding: 12 }} disabled={enviando || !email.includes("@") || (precisaSenha && senha.length < 6)}>
                {textoBotao}
              </button>
            </form>
            {erro && <div className="erro-msg">{erro}</div>}
            {modo === "criar" && (
              <p className="ajuda" style={{ fontSize: 12, textAlign: "center", margin: "10px 0 0" }}>
                Ao criar a conta, você concorda com os{" "}
                <a href="/termos" target="_blank" rel="noreferrer">Termos de uso</a> e a{" "}
                <a href="/privacidade" target="_blank" rel="noreferrer">Política de privacidade</a>.
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", marginTop: 14, fontSize: 13 }}>
              {modo === "entrar" && (
                <button className="link-botao" onClick={() => trocar("esqueci")}>
                  Esqueci minha senha
                </button>
              )}
              {modo !== "link" ? (
                <button className="link-botao" onClick={() => trocar("link")}>
                  Entrar sem senha (link por e-mail)
                </button>
              ) : null}
              {(modo === "link" || modo === "esqueci") && (
                <button className="link-botao" onClick={() => trocar("entrar")}>
                  ← Voltar para entrar com senha
                </button>
              )}
            </div>
          </>
        )}
        <p className="ajuda" style={{ textAlign: "center", fontSize: 12, marginTop: 18 }}>
          Contas novas começam com créditos de teste grátis. Depois de entrar, você continua conectado neste aparelho.
        </p>
      </div>
    </div>
  );
}

/** Janela para criar uma senha nova (depois do link de “Esqueci minha senha” ou pelo menu da conta). */
export function NovaSenha({ aoFechar, recuperacao }: { aoFechar: () => void; recuperacao?: boolean }) {
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erro, setErro] = useState<string>();
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (senha !== repetir) {
      setErro("As duas senhas não são iguais.");
      return;
    }
    setEnviando(true);
    setErro(undefined);
    const { error } = await supabase().auth.updateUser({ password: senha });
    setEnviando(false);
    if (error) setErro(traduzirErro(error.message));
    else setOk(true);
  }

  return (
    <div className="modal-fundo" onClick={recuperacao ? undefined : aoFechar}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3>{recuperacao ? "Crie sua nova senha" : "Definir ou trocar senha"}</h3>
        {ok ? (
          <>
            <p className="ajuda">✅ Senha salva! Da próxima vez, entre com o seu e-mail e essa senha.</p>
            <button className="botao" onClick={aoFechar}>
              Continuar
            </button>
          </>
        ) : (
          <form onSubmit={salvar}>
            <div className="campo">
              <label>Nova senha (mínimo 6 caracteres)</label>
              <input type="password" autoComplete="new-password" minLength={6} required value={senha} onChange={(e) => setSenha(e.target.value)} />
            </div>
            <div className="campo">
              <label>Repita a senha</label>
              <input type="password" autoComplete="new-password" minLength={6} required value={repetir} onChange={(e) => setRepetir(e.target.value)} />
            </div>
            {erro && <div className="erro-msg">{erro}</div>}
            <div className="linha" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="botao sec" onClick={aoFechar}>
                {recuperacao ? "Depois" : "Cancelar"}
              </button>
              <button className="botao" disabled={enviando || senha.length < 6}>
                {enviando ? "Salvando..." : "Salvar senha"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
