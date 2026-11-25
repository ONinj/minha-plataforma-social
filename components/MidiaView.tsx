"use client";

import { calcularAndamento, formatarTempo, useAgora } from "@/lib/progresso";
import { useStore, useUrlMidia } from "@/lib/store";
import type { Midia } from "@/lib/tipos";
import { baixarArquivo } from "@/lib/util";

const NOMES_ORIGEM: Record<Midia["origem"], string> = {
  gemini: "Imagem IA",
  veo: "Veo",
  seedance: "Seedance",
  upload: "Enviado por você",
};

export function VisualMidia({ midia, controles = false }: { midia: Midia; controles?: boolean }) {
  // Em miniaturas, vídeos da biblioteca mostram o quadro extraído (mais leve que carregar o vídeo).
  const usarQuadro = !controles && midia.tipo === "video" && !!midia.quadros;
  const urlLocal = useUrlMidia(midia.status === "pronto" ? (usarQuadro ? `${midia.id}_q0` : midia.id) : undefined, midia.status);
  const url = urlLocal ?? midia.urlExterna;

  if (midia.status === "gerando") return <ProducaoAoVivo midia={midia} />;
  if (usarQuadro && urlLocal) {
    return (
      <div className="visual" style={{ position: "relative" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urlLocal} alt={midia.titulo} />
        {midia.duracao && <span className="selo" style={{ left: "auto", right: 7, top: "auto", bottom: 7 }}>{Math.round(midia.duracao)}s</span>}
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

/** Prévia ao vivo de um vídeo em produção: fase, porcentagem estimada e tempo. */
export function ProducaoAoVivo({ midia, grande = false }: { midia: Midia; grande?: boolean }) {
  const { conta } = useStore();
  const agora = useAgora(1000);
  const referencia = useUrlMidia(midia.imagemInicial);
  const historico = conta.marcas.flatMap((m) => m.midias);
  const a = calcularAndamento(midia, historico, agora);
  return (
    <div className={`visual producao ${grande ? "grande" : ""}`}>
      {referencia && <div className="producao-fundo" style={{ backgroundImage: `url(${referencia})` }} />}
      <div className="producao-brilho" />
      <div className="producao-centro">
        <strong>{Math.floor(a.porcento)}%</strong>
        <span>{a.rotulo}</span>
        <span className="producao-tempo">
          {formatarTempo(a.decorrido)}
          {a.atrasado ? " · demorando mais que o normal" : a.restante != null ? ` · ~${formatarTempo(a.restante)} restantes` : ""}
        </span>
      </div>
      <div className="producao-barra">
        <div style={{ width: `${a.porcento}%` }} />
      </div>
    </div>
  );
}

/** Cartão grande de um vídeo sendo produzido (abas Veo e Seedance). */
export function CartaoProducao({ midia }: { midia: Midia }) {
  const nome = NOMES_ORIGEM[midia.origem];
  return (
    <div className="cartao-producao">
      <div style={{ width: 200, flexShrink: 0 }}>
        <div className="midia">
          <ProducaoAoVivo midia={midia} grande />
        </div>
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="linha" style={{ justifyContent: "space-between" }}>
          <b style={{ fontSize: 15 }}>{midia.titulo}</b>
          <span className="etiqueta" style={midia.pedidoPor === "gerente" ? { color: "var(--destaque-2)", borderColor: "rgba(139,92,246,.4)" } : undefined}>
            {midia.pedidoPor === "gerente" ? "✨ pedido pelo gerente" : "pedido por você"}
          </span>
        </div>
        <p className="ajuda" style={{ margin: "8px 0", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {midia.prompt}
        </p>
        <div className="linha" style={{ gap: 8 }}>
          <span className="etiqueta">
            <span className="girando" style={{ width: 10, height: 10, borderWidth: 2 }} /> {nome} ·{" "}
            {midia.fase === "fila" ? "na fila" : midia.fase === "baixando" ? "baixando" : "produzindo"}
          </span>
          {midia.imagemInicial && <span className="etiqueta">com imagem inicial</span>}
        </div>
        {midia.detalhe && (
          <p className="ajuda" style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, marginBottom: 0 }}>
            › {midia.detalhe}
          </p>
        )}
      </div>
    </div>
  );
}
