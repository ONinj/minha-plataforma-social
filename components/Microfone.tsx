"use client";

import { useEffect, useRef, useState } from "react";
import { falNoNavegador } from "@/lib/biblioteca";
import { useStore } from "@/lib/store";
import Icone from "./Icone";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Reconhecimento = any;

function criarReconhecimento(): Reconhecimento | null {
  if (typeof window === "undefined") return null;
  const R = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  return R ? new R() : null;
}

/**
 * Botão de microfone: você fala, o texto aparece ao vivo (aoParcial) e, quando para,
 * vai pronto para aoFinal. Usa o reconhecimento de voz do navegador (Chrome/Edge/Safari);
 * onde não existe, grava o áudio e transcreve com o Whisper no fal.ai.
 */
export default function Microfone({
  aoParcial,
  aoFinal,
  desativado,
}: {
  aoParcial: (texto: string) => void;
  aoFinal: (texto: string) => void;
  desativado?: boolean;
}) {
  const store = useStore();
  const [estado, setEstado] = useState<"parado" | "ouvindo" | "transcrevendo">("parado");
  const reconhecimento = useRef<Reconhecimento | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const textoFinal = useRef("");

  useEffect(() => () => {
    reconhecimento.current?.abort?.();
    gravador.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  function iniciarNavegador(r: Reconhecimento) {
    textoFinal.current = "";
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e: any) => {
      let parcial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) textoFinal.current += t;
        else parcial += t;
      }
      aoParcial((textoFinal.current + parcial).trim());
    };
    r.onerror = (e: any) => {
      if (e.error === "not-allowed") store.avisar("Permita o uso do microfone no navegador para falar.", "erro");
      else if (e.error !== "no-speech" && e.error !== "aborted") store.avisar(`Microfone: ${e.error}`, "erro");
    };
    r.onend = () => {
      setEstado("parado");
      reconhecimento.current = null;
      const t = textoFinal.current.trim();
      if (t) aoFinal(t);
    };
    reconhecimento.current = r;
    r.start();
    setEstado("ouvindo");
  }

  async function iniciarGravacao() {
    const chave = store.obter().config.chaveFal;
    if (!chave) {
      store.avisar("Este navegador não reconhece voz sozinho. Cadastre a chave do fal.ai para transcrever pelo Whisper.", "erro");
      return;
    }
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const g = new MediaRecorder(fluxo);
      const partes: Blob[] = [];
      g.ondataavailable = (e) => e.data.size && partes.push(e.data);
      g.onstop = async () => {
        fluxo.getTracks().forEach((t) => t.stop());
        setEstado("transcrevendo");
        try {
          const fal = falNoNavegador(chave);
          const url = await fal.storage.upload(new Blob(partes, { type: g.mimeType || "audio/webm" }));
          const r = await fal.subscribe("fal-ai/whisper", { input: { audio_url: url, task: "transcribe", language: "pt" } });
          const texto = String((r.data as { text?: string }).text ?? "").trim();
          if (texto) aoFinal(texto);
        } catch (e) {
          store.avisar(`Não consegui transcrever: ${e instanceof Error ? e.message : e}`, "erro");
        } finally {
          setEstado("parado");
        }
      };
      gravador.current = g;
      g.start();
      setEstado("ouvindo");
    } catch {
      store.avisar("Permita o uso do microfone no navegador para falar.", "erro");
    }
  }

  function alternar() {
    if (estado === "ouvindo") {
      reconhecimento.current?.stop();
      if (gravador.current?.state === "recording") gravador.current.stop();
      return;
    }
    const r = criarReconhecimento();
    if (r) iniciarNavegador(r);
    else iniciarGravacao();
  }

  return (
    <button
      type="button"
      className={`botao-icone microfone ${estado}`}
      onClick={alternar}
      disabled={desativado || estado === "transcrevendo"}
      title={estado === "ouvindo" ? "Parar e enviar" : estado === "transcrevendo" ? "Transcrevendo..." : "Falar (o texto é escrito e enviado)"}
      aria-label="Microfone"
    >
      {estado === "transcrevendo" ? <span className="girando" /> : <Icone nome={estado === "ouvindo" ? "parar" : "microfone"} />}
    </button>
  );
}
