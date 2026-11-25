"use client";

import { useState } from "react";
import { atualizarConexoes, conectarInstagram, desconectarInstagram, useInstagram } from "@/lib/instagram";
import { useStore } from "@/lib/store";
import { CORES, type Marca } from "@/lib/tipos";
import Icone, { Avatar } from "../Icone";

const REDES_CONEXAO: { chave: keyof Marca["redes"]; nome: string }[] = [
  { chave: "instagram", nome: "Instagram" },
  { chave: "facebook", nome: "Facebook" },
  { chave: "tiktok", nome: "TikTok" },
  { chave: "youtube", nome: "YouTube" },
];

export default function Perfis() {
  const store = useStore();
  const { conta, marca, editarMarca, removerMarca, editarConta, removerConta, raiz, ocupado } = store;
  const [perfil, setPerfil] = useState(marca.perfil);

  return (
    <div className="conteudo" style={{ maxWidth: 980 }}>
      <div className="cartao" style={{ marginBottom: 18 }}>
        <div className="linha" style={{ gap: 16, alignItems: "flex-start" }}>
          <Avatar nome={marca.nome} cor={marca.cor} tamanho={64} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="grade-2">
              <div className="campo">
                <label>Nome do perfil</label>
                <input type="text" value={marca.nome} onChange={(e) => editarMarca(marca.id, { nome: e.target.value })} />
              </div>
              <div className="campo">
                <label>@ do Instagram</label>
                <input type="text" value={marca.arroba} placeholder="sem @" onChange={(e) => editarMarca(marca.id, { arroba: e.target.value })} />
              </div>
            </div>
            <label>Cor</label>
            <div className="linha" style={{ gap: 8 }}>
              {CORES.map((c) => (
                <button
                  key={c}
                  aria-label={`Cor ${c}`}
                  onClick={() => editarMarca(marca.id, { cor: c })}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: c,
                    cursor: "pointer",
                    border: marca.cor === c ? "2px solid white" : "2px solid transparent",
                    boxShadow: marca.cor === c ? `0 0 0 3px ${c}55` : "none",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h3>
          <Icone nome="editar" /> Descrição do perfil (o gerente usa em toda conversa)
        </h3>
        <p className="ajuda" style={{ marginTop: -4 }}>
          Nicho, público, tom de voz, cores, produtos, frequência de posts, datas importantes.
        </p>
        <textarea
          rows={8}
          value={perfil}
          onChange={(e) => setPerfil(e.target.value)}
          placeholder="Ex.: Cafeteria artesanal em Curitiba. Público de 22 a 40 anos. Tom descontraído e acolhedor. Cores: marrom café, creme e verde-oliva. 3 posts por semana + stories diários."
        />
        <div className="linha" style={{ justifyContent: "flex-end", marginTop: 10 }}>
          {perfil !== marca.perfil && <span className="ajuda">Alterações não salvas</span>}
          <button
            className="botao"
            disabled={perfil === marca.perfil}
            onClick={() => {
              editarMarca(marca.id, { perfil });
              store.avisar("Perfil salvo. O gerente recebe a nova descrição na próxima mensagem.", "ok");
            }}
          >
            Salvar descrição
          </button>
        </div>
      </div>

      {store.nuvem && <CartaoInstagram />}

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h3>
          <Icone nome="link" /> Contas das redes
        </h3>
        <p className="ajuda" style={{ marginTop: -4 }}>
          Anote as contas de cada rede (o gerente usa essas informações).
        </p>
        <div className="grade-2">
          {REDES_CONEXAO.map((r) => (
            <div key={r.chave} className="campo">
              <label className="linha" style={{ gap: 6 }}>
                {r.chave === "instagram" && <Icone nome="instagram" tamanho={14} />} {r.nome}

              </label>
              <input
                type="text"
                placeholder="@usuario"
                value={marca.redes[r.chave] ?? ""}
                onChange={(e) => editarMarca(marca.id, { redes: { ...marca.redes, [r.chave]: e.target.value } })}
              />
            </div>
          ))}
        </div>
        {conta.marcas.length > 1 && (
          <div className="linha" style={{ justifyContent: "flex-end" }}>
            <button
              className="botao perigo"
              disabled={ocupado}
              onClick={() => {
                if (window.confirm(`Excluir o perfil "${marca.nome}" com todas as conversas, aprovações e calendário?`)) removerMarca(marca.id);
              }}
            >
              <Icone nome="lixo" tamanho={15} /> Excluir este perfil
            </button>
          </div>
        )}
      </div>

      <div className="cartao">
        <h3>
          <Icone nome="perfis" /> Conta
        </h3>
        <p className="ajuda" style={{ marginTop: -4 }}>
          A conta reúne os perfis que você cuida, as chaves das IAs e os gastos. Troque de conta no topo do menu.
        </p>
        <div className="grade-2">
          <div className="campo">
            <label>Nome da conta</label>
            <input type="text" value={conta.nome} onChange={(e) => editarConta(conta.id, { nome: e.target.value })} />
          </div>
          <div className="campo">
            <label>E-mail</label>
            <input type="email" value={conta.email} placeholder="voce@gmail.com" onChange={(e) => editarConta(conta.id, { email: e.target.value })} />
          </div>
        </div>
        {!store.nuvem && (
          <p className="ajuda">
            Neste modo as contas ficam salvas só neste navegador, sem senha.
          </p>
        )}
        {!store.nuvem && raiz.contas.length > 1 && (
          <div className="linha" style={{ justifyContent: "flex-end" }}>
            <button
              className="botao perigo"
              disabled={ocupado}
              onClick={() => {
                if (window.confirm(`Excluir a conta "${conta.nome}" e todos os ${conta.marcas.length} perfis dela?`)) removerConta(conta.id);
              }}
            >
              <Icone nome="lixo" tamanho={15} /> Excluir esta conta
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CartaoInstagram() {
  const store = useStore();
  const ig = useInstagram(store);
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="cartao" style={{ marginBottom: 18, borderColor: ig.conexao ? "rgba(34,197,94,.4)" : undefined }}>
      <h3>
        <Icone nome="instagram" /> Publicação automática no Instagram
      </h3>
      {!ig.noPlano ? (
        <div className="linha" style={{ justifyContent: "space-between" }}>
          <span className="ajuda">🔒 Publicar sozinho no Instagram na hora marcada faz parte do plano Premium.</span>
          <span className="ajuda">Veja em Plano e créditos.</span>
        </div>
      ) : !ig.configurado ? (
        <p className="ajuda">A conexão com o Instagram ainda está sendo configurada pela equipe da plataforma.</p>
      ) : ig.conexao ? (
        <div className="linha" style={{ justifyContent: "space-between" }}>
          <span>
            ✅ Conectado como <b>@{ig.conexao.username}</b>
            <span className="ajuda" style={{ display: "block", fontSize: 12 }}>
              A conexão se renova sozinha. No calendário, ative &quot;Publicar automaticamente&quot; em cada post.
            </span>
          </span>
          <button
            className="botao perigo peq"
            disabled={ocupado}
            onClick={async () => {
              if (!window.confirm("Desconectar o Instagram deste perfil? As publicações agendadas não vão sair.")) return;
              setOcupado(true);
              await desconectarInstagram(store.marca.id).catch((e) => store.avisar(String(e.message), "erro"));
              await atualizarConexoes();
              setOcupado(false);
            }}
          >
            Desconectar
          </button>
        </div>
      ) : (
        <>
          <p className="ajuda" style={{ marginTop: -4 }}>
            Conecte a conta do Instagram deste perfil para publicar sozinho na data marcada (posts, carrosséis, reels e stories).
            A conta precisa ser <b>profissional</b> (Empresa ou Criador de conteúdo).
          </p>
          <button
            className="botao"
            disabled={ocupado}
            onClick={async () => {
              setOcupado(true);
              try {
                await conectarInstagram(store.marca.id);
              } catch (e) {
                store.avisar(e instanceof Error ? e.message : String(e), "erro");
                setOcupado(false);
              }
            }}
          >
            <Icone nome="instagram" /> Conectar Instagram
          </button>
        </>
      )}
    </div>
  );
}
