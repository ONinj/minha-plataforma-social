"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/nuvem";
import { useStore } from "@/lib/store";
import { formatarData } from "@/lib/util";
import Icone from "./Icone";

type Dados = {
  membros: { user_id: string; papel: string; criado_em: string; email: string | null }[];
  convites: { id: string; email: string; criado_em: string; expira_em: string }[];
  limite: number;
  voce: string;
  papel: string;
};

/** Configurações → Equipe: o dono convida pessoas para trabalhar na mesma conta. */
export default function Equipe() {
  const store = useStore();
  const [dados, setDados] = useState<Dados | null>(null);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<{ url: string; email: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(() => {
    api<Dados>("/api/equipe").then(setDados).catch(() => setDados(null));
  }, []);
  useEffect(carregar, [carregar, store.nuvem?.conta.id]);
  if (!store.nuvem || !dados) return null;
  const dono = dados.papel === "dono";
  const usados = dados.membros.length + dados.convites.length;

  async function convidar() {
    setOcupado(true);
    try {
      const r = await api<{ url: string }>("/api/equipe", { corpo: { acao: "convidar", email } });
      setLink({ url: r.url, email: email.trim() });
      setEmail("");
      carregar();
    } catch (e) {
      store.avisar(e instanceof Error ? e.message : String(e), "erro");
    } finally {
      setOcupado(false);
    }
  }

  const mensagem = link
    ? `Oi! Te convidei para trabalhar comigo na conta "${store.nuvem.conta.nome}" da Galhos. Abra o link e entre (ou crie a conta) com o e-mail ${link.email}: ${link.url}`
    : "";

  return (
    <div className="cartao" style={{ marginBottom: 18 }}>
      <h3>
        <Icone nome="perfis" /> Equipe
      </h3>
      <p className="ajuda" style={{ marginTop: -4 }}>
        Pessoas da equipe usam os perfis, o gerente e os créditos desta conta. Só o dono mexe no plano, na cobrança e na equipe.
        {" "}Seu plano permite {dados.limite} pessoa{dados.limite > 1 ? "s" : ""} (com você).
      </p>
      <div className="lista" style={{ gap: 6, marginBottom: 12 }}>
        {dados.membros.map((m) => (
          <div key={m.user_id} className="linha" style={{ justifyContent: "space-between", fontSize: 14 }}>
            <span>
              {m.email ?? "—"} <span className="ajuda">· {m.papel === "dono" ? "dono" : "equipe"}{m.user_id === dados.voce ? " (você)" : ""}</span>
            </span>
            {dono && m.papel !== "dono" && (
              <button
                className="botao perigo peq"
                onClick={async () => {
                  if (!window.confirm(`Tirar ${m.email} da equipe?`)) return;
                  await api("/api/equipe", { corpo: { acao: "remover", userId: m.user_id } }).catch((e) => store.avisar(String(e.message), "erro"));
                  carregar();
                }}
              >
                Remover
              </button>
            )}
          </div>
        ))}
        {dados.convites.map((c) => (
          <div key={c.id} className="linha" style={{ justifyContent: "space-between", fontSize: 14 }}>
            <span>
              {c.email} <span className="ajuda">· convite enviado, vale até {formatarData(c.expira_em).split(",")[0]}</span>
            </span>
            <button
              className="botao sec peq"
              onClick={async () => {
                await api("/api/equipe", { corpo: { acao: "cancelar-convite", id: c.id } }).catch(() => {});
                carregar();
              }}
            >
              Cancelar
            </button>
          </div>
        ))}
      </div>

      {dono && (
        <>
          {usados < dados.limite ? (
            <div className="linha" style={{ gap: 8, flexWrap: "wrap" }}>
              <input type="email" value={email} placeholder="e-mail da pessoa" onChange={(e) => setEmail(e.target.value)} style={{ maxWidth: 300 }} />
              <button className="botao" disabled={ocupado || !email.includes("@")} onClick={convidar}>
                {ocupado ? "Criando..." : "Convidar"}
              </button>
            </div>
          ) : (
            <p className="ajuda">{dados.limite <= 1 ? "🔒 Equipe a partir do plano Profissional." : "Você chegou ao limite de pessoas do seu plano."}</p>
          )}
          {link && (
            <div className="cartao" style={{ marginTop: 12, padding: 12 }}>
              <p className="ajuda" style={{ marginTop: 0 }}>
                Convite criado. Mande este link para <b>{link.email}</b> (ele só aparece agora e vale 7 dias):
              </p>
              <input type="text" readOnly value={link.url} onFocus={(e) => e.target.select()} />
              <div className="linha" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button
                  className="botao peq"
                  onClick={async () => {
                    await navigator.clipboard.writeText(mensagem);
                    setCopiado(true);
                    setTimeout(() => setCopiado(false), 2000);
                  }}
                >
                  <Icone nome="copiar" tamanho={14} /> {copiado ? "Copiado!" : "Copiar mensagem"}
                </button>
                <a className="botao sec peq" style={{ textDecoration: "none" }} href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noreferrer">
                  Enviar pelo WhatsApp
                </a>
              </div>
            </div>
          )}
        </>
      )}
      {!dono && (
        <button
          className="botao perigo peq"
          onClick={async () => {
            if (!window.confirm(`Sair da equipe da conta "${store.nuvem!.conta.nome}"?`)) return;
            await api("/api/equipe", { corpo: { acao: "sair" } }).catch((e) => store.avisar(String(e.message), "erro"));
            try {
              localStorage.removeItem("conta-ativa");
            } catch {}
            window.location.reload();
          }}
        >
          Sair desta equipe
        </button>
      )}
    </div>
  );
}
