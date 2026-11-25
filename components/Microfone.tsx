"use client";

import { useEffect, useRef, useState } from "react";
import { falNoNavegador } from "@/lib/biblioteca";
import { formatarTempo } from "@/lib/progresso";
import { useStore } from "@/lib/store";
import Icone from "./Icone";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SILENCIO_PARA_PARAR = 2200; // ms de silêncio depois de falar
const LIMITE = 3 * 60 * 1000; // grava no máximo 3 minutos

/**
 * Botão de microfone: grava a sua voz, mostra o nível do som (para você ver que está
 * captando), para sozinho quando você fica em silêncio e transcreve com o Whisper no
 * fal.ai. Funciona em qualquer navegador. Sem chave do fal.ai, tenta o reconhecimento
 * de voz do próprio navegador (só funciona bem no Chrome e no Edge).
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
  const [nivel, setNivel] = useState(0);
  const [segundos, setSegundos] = useState(0);
  const parar = useRef<() => void>(() => {});
  const limpar = useRef<() => void>(() => {});

  useEffect(() => () => limpar.current(), []);

  async function gravarComWhisper(chave: string) {
    let fluxo: MediaStream;
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      store.avisar("O navegador bloqueou o microfone. Clique no cadeado ao lado do endereço do site e permita o microfone.", "erro");
      return;
    }
    const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t));
    const gravador = new MediaRecorder(fluxo, tipo ? { mimeType: tipo } : undefined);
    const partes: Blob[] = [];
    gravador.ondataavailable = (e) => e.data.size && partes.push(e.data);

    // Medidor de volume + parada automática no silêncio.
    const ctx = new AudioContext();
    const analisador = ctx.createAnalyser();
    analisador.fftSize = 512;
    ctx.createMediaStreamSource(fluxo).connect(analisador);
    const dados = new Uint8Array(analisador.fftSize);
    const inicio = Date.now();
    let falou = false;
    let ultimoSom = Date.now();
    let quadro = 0;
    const medir = () => {
      analisador.getByteTimeDomainData(dados);
      let soma = 0;
      for (const v of dados) soma += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(soma / dados.length);
      setNivel(Math.min(1, rms * 6));
      setSegundos((Date.now() - inicio) / 1000);
      if (rms > 0.04) {
        falou = true;
        ultimoSom = Date.now();
      }
      if ((falou && Date.now() - ultimoSom > SILENCIO_PARA_PARAR) || Date.now() - inicio > LIMITE) {
        parar.current();
        return;
      }
      quadro = requestAnimationFrame(medir);
    };

    limpar.current = () => {
      cancelAnimationFrame(quadro);
      fluxo.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
      setNivel(0);
    };
    parar.current = () => {
      if (gravador.state === "recording") gravador.stop();
    };

    gravador.onstop = async () => {
      limpar.current();
      if (!falou) {
        setEstado("parado");
        store.avisar("Não ouvi nada. Confira se o microfone certo está selecionado no computador.", "erro");
        return;
      }
      setEstado("transcrevendo");
      try {
        const fal = falNoNavegador(chave);
        const audio = new Blob(partes, { type: (gravador.mimeType || "audio/webm").split(";")[0] });
        const url = await fal.storage.upload(audio);
        let r;
        try {
          r = await fal.subscribe("fal-ai/whisper", { input: { audio_url: url, task: "transcribe", language: "pt" } });
        } catch {
          r = await fal.subscribe("fal-ai/whisper", { input: { audio_url: url, task: "transcribe" } });
        }
        const texto = String((r.data as { text?: string }).text ?? "").trim();
        if (texto) aoFinal(texto);
        else store.avisar("Não entendi o áudio. Tente falar mais perto do microfone.", "erro");
      } catch (e) {
        store.avisar(`Não consegui transcrever: ${e instanceof Error ? e.message : e}`, "erro");
      } finally {
        setEstado("parado");
      }
    };

    gravador.start(250);
    setSegundos(0);
    setEstado("ouvindo");
    quadro = requestAnimationFrame(medir);
  }

  function reconhecerNoNavegador() {
    const R = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!R) {
      store.avisar("Para usar o microfone neste navegador, cadastre a chave do fal.ai em Configurações.", "erro");
      return;
    }
    const r = new R();
    let final = "";
    let recebeu = false;
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e: any) => {
      recebeu = true;
      let parcial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else parcial += e.results[i][0].transcript;
      }
      aoParcial((final + parcial).trim());
    };
    r.onerror = (e: any) => {
      if (e.error === "not-allowed") store.avisar("Permita o uso do microfone no navegador.", "erro");
      else if (e.error === "network") store.avisar("O reconhecimento de voz deste navegador não está disponível. Cadastre a chave do fal.ai para usar o Whisper.", "erro");
    };
    r.onend = () => {
      setEstado("parado");
      if (final.trim()) aoFinal(final.trim());
      else if (!recebeu) store.avisar("O navegador não reconheceu nada. Cadastre a chave do fal.ai para usar o Whisper, que funciona em qualquer navegador.", "erro");
    };
    parar.current = () => r.stop();
    limpar.current = () => r.abort?.();
    r.start();
    setEstado("ouvindo");
  }

  function alternar() {
    if (estado === "ouvindo") return parar.current();
    const chave = store.obter().config.chaveFal;
    if (chave) gravarComWhisper(chave);
    else reconhecerNoNavegador();
  }

  const titulo =
    estado === "ouvindo"
      ? `Ouvindo ${formatarTempo(segundos)}: clique para parar e enviar (ou fique em silêncio)`
      : estado === "transcrevendo"
        ? "Transcrevendo..."
        : "Falar: o que você disser é escrito e enviado";

  return (
    <button
      type="button"
      className={`botao-icone microfone ${estado}`}
      onClick={alternar}
      disabled={desativado || estado === "transcrevendo"}
      title={titulo}
      aria-label={titulo}
      style={estado === "ouvindo" ? { boxShadow: `0 0 0 ${2 + nivel * 10}px rgba(244,63,94,${0.25 + nivel * 0.35})` } : undefined}
    >
      {estado === "transcrevendo" ? <span className="girando" /> : <Icone nome={estado === "ouvindo" ? "parar" : "microfone"} />}
      {estado === "ouvindo" && <span className="microfone-tempo">{formatarTempo(segundos)}</span>}
    </button>
  );
}
