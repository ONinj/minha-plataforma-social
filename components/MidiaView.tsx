"use client";

import { useStore, useUrlMidia } from "@/lib/store";
import type { Midia } from "@/lib/tipos";
import { baixarArquivo } from "@/lib/util";

const NOMES_ORIGEM: Record<Midia["origem"], string> = {
  gemini: "Imagem IA",
  veo: "Veo",
  seedance: "Seedance",
  upload: "Upload",
};

export function VisualMidia({ midia, controles = false }: { midia: Midia; controles?: boolean }) {
  const urlLocal = useUrlMidia(midia.status === "pronto" ? midia.id : undefined, midia.status);
  const url = urlLocal ?? midia.urlExterna;

  if (midia.status === "gerando") {
    return (
      <div className="visual" style={{ flexDirection: "column", gap: 8, color: "var(--texto-2)", fontSize: 12 }}>
        <div className="girando" />
        Gerando no {NOMES_ORIGEM[midia.origem]}...
      </div>
    );
  }
  if (midia.status === "erro") {
    return (
      <div className="visual" style={{ color: "var(--erro)", fontSize: 12, padding: 8, textAlign: "center" }}>
        Falhou: {midia.erro ?? "erro desconhecido"}
      </div>
    );
  }
  if (!url) return <div className="visual" />;
  return (
    <div className="visual">
      {midia.tipo === "imagem" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={midia.titulo} />
      ) : (
        <video src={url} controls={controles} muted={!controles} playsInline loop preload="metadata" />
      )}
    </div>
  );
}

export function CartaoMidia({
  midia,
  mini = false,
  selecionada,
  aoClicar,
  acoes,
}: {
  midia: Midia;
  mini?: boolean;
  selecionada?: boolean;
  aoClicar?: () => void;
  acoes?: React.ReactNode;
}) {
  return (
    <div
      className={`midia ${mini ? "mini" : ""} ${selecionada ? "selecionada" : ""}`}
      onClick={aoClicar}
      style={aoClicar ? { cursor: "pointer" } : undefined}
    >
      <span className="selo">{NOMES_ORIGEM[midia.origem]}</span>
      <VisualMidia midia={midia} controles={!mini && !aoClicar} />
      <div className="info">
        <b title={midia.titulo}>{midia.titulo}</b>
        {!mini && <span className="ajuda">{midia.tipo === "video" ? "Vídeo" : "Imagem"}</span>}
      </div>
      {acoes && <div className="acoes">{acoes}</div>}
    </div>
  );
}

/** Mostra uma mídia a partir do id (usado dentro do chat e das aprovações). */
export function MidiaPorId({ id, mini = true }: { id: string; mini?: boolean }) {
  const { estado } = useStore();
  const midia = estado.midias.find((m) => m.id === id);
  if (!midia) return <span className="etiqueta">mídia {id} não encontrada</span>;
  return <CartaoMidia midia={midia} mini={mini} />;
}

export function BotaoBaixar({ midia }: { midia: Midia }) {
  const urlLocal = useUrlMidia(midia.status === "pronto" ? midia.id : undefined, midia.status);
  const url = urlLocal ?? midia.urlExterna;
  if (!url) return null;
  const ext = midia.tipo === "video" ? "mp4" : (midia.mime?.split("/")[1] ?? "png");
  return (
    <button
      className="botao sec peq"
      onClick={(e) => {
        e.stopPropagation();
        baixarArquivo(url, `${midia.titulo.replace(/[^\w\-]+/g, "_")}.${ext}`);
      }}
    >
      Baixar
    </button>
  );
}
