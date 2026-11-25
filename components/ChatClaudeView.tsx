"use client";

import { useEffect, useRef, useState } from "react";
import type { MensagemClaude } from "@/lib/tipos";
import Markdown from "./Markdown";
import { MidiaPorId } from "./MidiaView";

const NOMES_FERRAMENTAS: Record<string, string> = {
  gerar_imagem: "Pediu uma imagem (Nano Banana)",
  gerar_video: "Pediu um vídeo",
  enviar_para_aprovacao: "Enviou para aprovação",
  listar_agendamentos: "Consultou o calendário",
  listar_midias: "Consultou a biblioteca de mídias",
};

function idsDeMidia(texto: string): string[] {
  return [...texto.matchAll(/\[midia:([\w]+)\]/g)].map((m) => m[1]);
}

function Mensagem({ msg }: { msg: MensagemClaude }) {
  if (msg.role === "system") {
    return <div className="ferramenta">📋 Perfil da marca atualizado para o Claude</div>;
  }
  if (msg.role === "user") {
    if (typeof msg.content === "string") {
      return <div className="msg usuario">{msg.content.replace(/^\[Agora: [^\]]*\]\n/, "")}</div>;
    }
    return (
      <>
        {msg.content.map((bloco, i) => {
          if (bloco.type === "text") return <div key={i} className="msg usuario">{bloco.text}</div>;
          if (bloco.type !== "tool_result") return null;
          const texto =
            typeof bloco.content === "string"
              ? bloco.content
              : (bloco.content ?? []).map((c) => (c.type === "text" ? c.text : "")).join("\n");
          const ids = idsDeMidia(texto);
          const curto = texto.length > 220 ? `${texto.slice(0, 220)}…` : texto;
          return (
            <div key={i} className={`ferramenta ${bloco.is_error ? "erro" : ""}`}>
              {ids.length > 0 ? (
                <div className="linha">
                  {ids.map((id) => (
                    <MidiaPorId key={id} id={id} />
                  ))}
                </div>
              ) : (
                <span>{bloco.is_error ? `⚠️ ${curto}` : `✓ ${curto}`}</span>
              )}
            </div>
          );
        })}
      </>
    );
  }

  const blocos = typeof msg.content === "string" ? [{ type: "text" as const, text: msg.content }] : msg.content;
  return (
    <>
      {(blocos ?? []).map((b, i) => {
        if (b.type === "text" && b.text.trim()) {
          return (
            <div key={i} className="msg ia">
              <Markdown texto={b.text} />
            </div>
          );
        }
        if (b.type === "tool_use") {
          const entrada = b.input as { titulo?: string };
          return (
            <div key={i} className="ferramenta">
              🛠 {NOMES_FERRAMENTAS[b.name] ?? b.name}
              {entrada?.titulo ? `: ${entrada.titulo}` : ""}
            </div>
          );
        }
        return null;
      })}
    </>
  );
}

export default function ChatClaudeView({
  mensagens,
  ocupado,
  etapa,
  erro,
  placeholder,
  boasVindas,
  aoEnviar,
}: {
  mensagens: MensagemClaude[];
  ocupado: boolean;
  etapa?: string;
  erro?: string;
  placeholder: string;
  boasVindas: React.ReactNode;
  aoEnviar: (texto: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.length, etapa, erro]);

  function enviar() {
    const t = texto.trim();
    if (!t || ocupado) return;
    setTexto("");
    aoEnviar(t);
  }

  return (
    <div className="chat">
      <div className="mensagens">
        {mensagens.length === 0 && boasVindas}
        {mensagens.map((m, i) => (
          <Mensagem key={i} msg={m} />
        ))}
        {ocupado && (
          <div className="etapa">
            <div className="girando" /> {etapa ?? "Pensando..."}
          </div>
        )}
        {erro && <div className="erro-msg">{erro}</div>}
        <div ref={fim} />
      </div>
      <div className="entrada">
        <textarea
          value={texto}
          placeholder={placeholder}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
        />
        <button className="botao" onClick={enviar} disabled={ocupado || !texto.trim()}>
          Enviar
        </button>
      </div>
    </div>
  );
}
