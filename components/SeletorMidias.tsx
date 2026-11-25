"use client";

import { useRef, useState } from "react";
import { useStore } from "@/lib/store";
import type { Midia } from "@/lib/tipos";
import { agoraISO, novoId } from "@/lib/util";
import { CartaoMidia } from "./MidiaView";

/** Salva arquivos enviados pelo usuário na biblioteca de mídias. */
export function useUpload() {
  const store = useStore();
  return async (arquivos: FileList | null): Promise<Midia[]> => {
    const novas: Midia[] = [];
    for (const arq of Array.from(arquivos ?? [])) {
      const tipo = arq.type.startsWith("video") ? "video" : arq.type.startsWith("image") ? "imagem" : null;
      if (!tipo) continue;
      const midia: Midia = {
        id: novoId(tipo === "video" ? "vid" : "img"),
        tipo,
        titulo: arq.name.replace(/\.[^.]+$/, ""),
        origem: "upload",
        status: "pronto",
        mime: arq.type,
        criadoEm: agoraISO(),
      };
      await store.salvarBlob(midia.id, arq);
      novas.push(midia);
    }
    if (novas.length) store.atualizar((e) => ({ ...e, midias: [...novas, ...e.midias] }));
    return novas;
  };
}

export function BotaoUpload({
  aoEnviar,
  rotulo = "Enviar arquivo",
  aceitar = "image/*,video/*",
}: {
  aoEnviar?: (m: Midia[]) => void;
  rotulo?: string;
  aceitar?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUpload();
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={aceitar}
        multiple
        hidden
        onChange={async (e) => {
          const novas = await upload(e.target.files);
          e.target.value = "";
          aoEnviar?.(novas);
        }}
      />
      <button className="botao sec" onClick={() => input.current?.click()}>
        {rotulo}
      </button>
    </>
  );
}

/** Janela para escolher imagens da biblioteca (ou enviar novas). */
export default function SeletorMidias({
  selecionadas,
  multiplo = true,
  tipos = ["imagem"],
  titulo = "Escolher imagem de referência",
  aoConfirmar,
  aoFechar,
}: {
  selecionadas: string[];
  multiplo?: boolean;
  tipos?: Midia["tipo"][];
  titulo?: string;
  aoConfirmar: (ids: string[]) => void;
  aoFechar: () => void;
}) {
  const { estado } = useStore();
  const [escolha, setEscolha] = useState<string[]>(selecionadas);
  const imagens = estado.midias.filter((m) => tipos.includes(m.tipo) && m.status === "pronto");

  function alternar(id: string) {
    if (!multiplo) return setEscolha([id]);
    setEscolha((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="linha" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{titulo}</h3>
          <BotaoUpload
            rotulo="Enviar do computador/celular"
            aceitar={tipos.includes("video") ? "image/*,video/*" : "image/*"}
            aoEnviar={(n) => {
              if (!multiplo) return n[0] && alternar(n[0].id);
              setEscolha((s) => [...new Set([...s, ...n.map((m) => m.id)])]);
            }}
          />
        </div>
        {imagens.length === 0 ? (
          <p className="vazio">Nada na biblioteca ainda. Use o botão acima para enviar.</p>
        ) : (
          <div className="grade-midias">
            {imagens.map((m) => (
              <CartaoMidia key={m.id} midia={m} mini selecionada={escolha.includes(m.id)} aoClicar={() => alternar(m.id)} />
            ))}
          </div>
        )}
        <div className="linha" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="botao sec" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            className="botao"
            onClick={() => {
              aoConfirmar(escolha);
              aoFechar();
            }}
          >
            Usar {escolha.length ? `(${escolha.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
