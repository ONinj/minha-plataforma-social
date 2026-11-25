"use client";

import { useState } from "react";
import { mensagemDePerfil, textoDoPerfil } from "@/lib/perfil";
import { chamarClaude } from "@/lib/servicos";
import { useStore } from "@/lib/store";
import ChatClaudeView from "../ChatClaudeView";
import Icone from "../Icone";

const SYSTEM =
  "Você é o Claude, assistente de marketing e criação de conteúdo para redes sociais. Responda em português do Brasil, de forma clara e prática. Quando pedirem prompts para outras IAs (Gemini, Veo, Seedance), escreva prompts detalhados prontos para copiar.";

export default function ClaudeDireto() {
  const store = useStore();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string>();

  async function enviar(texto: string) {
    setErro(undefined);
    setOcupado(true);
    const tamanhoAntes = store.obter().chatClaude.length;
    store.atualizar((e) => {
      const chat = [...e.chatClaude, { role: "user" as const, content: texto }];
      const perfil = mensagemDePerfil(chat, textoDoPerfil(store));
      return { ...e, chatClaude: perfil ? [...chat, perfil] : chat };
    });
    try {
      const resposta = await chamarClaude(store, {
        system: SYSTEM,
        messages: store.obter().chatClaude,
        effort: "medium",
      });
      store.atualizar((e) => ({
        ...e,
        chatClaude: [...e.chatClaude, { role: "assistant", content: resposta.content }],
      }));
      if (resposta.stop_reason === "refusal") setErro("O Claude recusou este pedido.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      // Remove a pergunta sem resposta para a conversa continuar válida.
      store.atualizar((e) => ({ ...e, chatClaude: e.chatClaude.slice(0, tamanhoAntes) }));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <ChatClaudeView
      mensagens={store.estado.chatClaude}
      ocupado={ocupado}
      erro={erro}
      placeholder="Converse direto com o Claude…"
      aoEnviar={enviar}
      boasVindas={
        <div className="boas-vindas">
          <div className="orb" style={{ background: "linear-gradient(135deg, #e08a5f, #b45309)" }}>
            <Icone nome="chat" tamanho={28} />
          </div>
          <h2 className="titulo-pagina">Conversa direta com o Claude</h2>
          <p className="ajuda">
            Sem acionar as outras IAs. Bom para ideias, roteiros, legendas, respostas a comentários e prompts. Ele já conhece
            o perfil <b>{store.marca.nome}</b>.
          </p>
        </div>
      }
    />
  );
}
