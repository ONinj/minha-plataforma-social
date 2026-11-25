"use client";

import { useEffect, useState } from "react";
import { rodarGerente } from "@/lib/gerente";
import { useStore } from "@/lib/store";
import ChatClaudeView from "../ChatClaudeView";

const SUGESTOES = [
  "Monte o planejamento de dezembro para o meu Instagram: 3 posts por semana e stories diários.",
  "Crie 3 cards de feed sobre dicas do meu nicho, com a mesma identidade visual.",
  "Faça um reels de 8 segundos apresentando meu perfil, com uma imagem de referência antes.",
];

export default function Gerente({ pendente, aoConsumir }: { pendente?: string; aoConsumir: () => void }) {
  const store = useStore();
  const [ocupado, setOcupado] = useState(false);
  const [etapa, setEtapa] = useState<string>();
  const [erro, setErro] = useState<string>();

  // Mensagens vindas da aba Aprovações (ajustes, produzir planejamento).
  useEffect(() => {
    if (pendente && !ocupado) {
      aoConsumir();
      enviar(pendente);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendente]);

  async function enviar(texto: string) {
    setErro(undefined);
    setOcupado(true);
    try {
      const fim = await rodarGerente(
        store,
        texto,
        async (msg) => window.confirm(msg),
        setEtapa,
      );
      if (fim === "refusal") setErro("O Claude recusou este pedido. Tente reformular.");
      if (fim === "max_tokens") setErro("A resposta ficou longa demais e foi cortada. Peça para ele continuar.");
      if (fim === "limite") setErro("O gerente fez muitas etapas seguidas e parou por segurança. Peça para continuar.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
      setEtapa(undefined);
    }
  }

  return (
    <ChatClaudeView
      mensagens={store.estado.chatGerente}
      ocupado={ocupado}
      etapa={etapa}
      erro={erro}
      placeholder="Dê a ideia ou peça o planejamento… (Enter envia, Shift+Enter quebra linha)"
      aoEnviar={enviar}
      boasVindas={
        <div className="cartao" style={{ maxWidth: 720 }}>
          <h3>Central: fale com o gerente</h3>
          <p className="ajuda">
            Aqui você conversa só com o Claude. Ele planeja, escreve os prompts, manda o Gemini criar as imagens e o
            Veo/Seedance gerar os vídeos, revisa tudo e coloca na aba <b>Aprovações</b>. Você só aprova.
          </p>
          <p className="ajuda">Experimente:</p>
          <div className="lista" style={{ gap: 8 }}>
            {SUGESTOES.map((s) => (
              <button key={s} className="botao sec" style={{ textAlign: "left" }} onClick={() => enviar(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      }
    />
  );
}
