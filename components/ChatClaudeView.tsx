"use client";

import { useEffect, useRef, useState } from "react";
import type { MensagemClaude } from "@/lib/tipos";
import Markdown from "./Markdown";
import { formatarTempo, useAgora } from "@/lib/progresso";
import Icone from "./Icone";
import { MidiaPorId } from "./MidiaView";
import SeletorMidias, { useUpload } from "./SeletorMidias";

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

const semData = (t: string) => t.replace(/^\[Agora: [^\]]*\]\n/, "");

function Mensagem({ msg }: { msg: MensagemClaude }) {
  if (msg.role === "system") {
    return <div className="ferramenta">📋 Perfil da marca atualizado para o Claude</div>;
  }
  if (msg.role === "user") {
    if (typeof msg.content === "string") {
      return <div className="msg usuario">{semData(msg.content)}</div>;
    }
    const textos = msg.content.filter((b) => b.type === "text");
    const anexos = textos.filter((b) => b.text.startsWith("[midia:")).flatMap((b) => idsDeMidia(b.text));
    const falas = textos.filter((b) => !b.text.startsWith("[midia:"));
    return (
      <>
        {anexos.length > 0 && (
          <div className="linha" style={{ alignSelf: "flex-end" }}>
            {anexos.map((id) => (
              <MidiaPorId key={id} id={id} />
            ))}
          </div>
        )}
        {falas.map((b, i) => (
          <div key={`t${i}`} className="msg usuario">
            {semData(b.text)}
          </div>
        ))}
        {msg.content.map((bloco, i) => {
          if (bloco.type !== "tool_result") return null;
          const texto =
            typeof bloco.content === "string"
              ? bloco.content
              : (bloco.content ?? []).map((c) => (c.type === "text" ? c.text : "")).join("\n");
          const ids = idsDeMidia(texto);
          const curto = texto.length > 220 ? `${texto.slice(0, 220)}…` : texto;
          return (
            <div key={i} className={`ferramenta ${bloco.is_error ? "erro" : ""}`}>
              {ids.length > 0 && !bloco.is_error ? (
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
  permitirAnexos = false,
  anexosIniciais,
}: {
  mensagens: MensagemClaude[];
  ocupado: boolean;
  etapa?: string;
  erro?: string;
  placeholder: string;
  boasVindas: React.ReactNode;
  aoEnviar: (texto: string, anexos: string[]) => void;
  permitirAnexos?: boolean;
  anexosIniciais?: string[];
}) {
  const [texto, setTexto] = useState("");
  const [anexos, setAnexos] = useState<string[]>([]);
  const [seletor, setSeletor] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const upload = useUpload();

  // Colar (Ctrl+V) ou arrastar fotos/vídeos direto no chat.
  async function anexarArquivos(arquivos: FileList | null) {
    if (!permitirAnexos || !arquivos?.length) return;
    const novas = await upload(arquivos);
    if (novas.length) setAnexos((a) => [...new Set([...a, ...novas.map((m) => m.id)])]);
  }

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.length, etapa, erro]);

  useEffect(() => {
    if (anexosIniciais?.length) setAnexos((a) => [...new Set([...a, ...anexosIniciais])]);
  }, [anexosIniciais]);

  function enviar() {
    const t = texto.trim();
    if ((!t && !anexos.length) || ocupado) return;
    setTexto("");
    setAnexos([]);
    aoEnviar(t, anexos);
  }

  return (
    <div
      className={`chat ${arrastando ? "arrastando" : ""}`}
      onDragOver={(e) => {
        if (!permitirAnexos || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setArrastando(false);
      }}
      onDrop={(e) => {
        if (!permitirAnexos) return;
        e.preventDefault();
        setArrastando(false);
        anexarArquivos(e.dataTransfer.files);
      }}
    >
      <div className="mensagens">
        {mensagens.length === 0 && boasVindas}
        {mensagens.map((m, i) => (
          <Mensagem key={i} msg={m} />
        ))}
        {ocupado && <Etapa texto={etapa ?? "Pensando..."} />}
        {erro && <div className="erro-msg">{erro}</div>}
        <div ref={fim} />
      </div>
      {anexos.length > 0 && (
        <div className="anexos">
          {anexos.map((id) => (
            <MidiaPorId key={id} id={id} />
          ))}
          <button className="botao sec peq" onClick={() => setAnexos([])}>
            Remover anexos
          </button>
        </div>
      )}
      <div className="entrada">
        {permitirAnexos && (
          <button className="botao-icone" onClick={() => setSeletor(true)} title="Anexar fotos ou vídeos (ou cole/arraste aqui)" disabled={ocupado}>
            <Icone nome="clipe" />
          </button>
        )}
        <textarea
          value={texto}
          placeholder={placeholder}
          onChange={(e) => setTexto(e.target.value)}
          onPaste={(e) => {
            if (permitirAnexos && e.clipboardData.files.length) {
              e.preventDefault();
              anexarArquivos(e.clipboardData.files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
        />
        <button className="botao" onClick={enviar} disabled={ocupado || (!texto.trim() && !anexos.length)} aria-label="Enviar">
          <Icone nome="enviar" tamanho={16} />
        </button>
      </div>
      {seletor && (
        <SeletorMidias
          titulo="Anexar fotos ou vídeos"
          tipos={["imagem", "video"]}
          selecionadas={anexos}
          aoConfirmar={setAnexos}
          aoFechar={() => setSeletor(false)}
        />
      )}
    </div>
  );
}

/** Linha "trabalhando" com o tempo correndo ao vivo. */
export function Etapa({ texto, tipico }: { texto: string; tipico?: string }) {
  const [inicio] = useState(() => Date.now());
  const agora = useAgora(1000);
  return (
    <div className="etapa">
      <div className="girando" /> {texto}
      <span className="tempo-vivo">
        {formatarTempo((agora - inicio) / 1000)}
        {tipico ? ` · normalmente ${tipico}` : ""}
      </span>
    </div>
  );
}
