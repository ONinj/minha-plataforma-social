"use client";

import { useState } from "react";
import { cabecalhosNuvem } from "@/lib/nuvem";

/** Botão que abre o diagnóstico completo (/api/saude com o login do administrador). */
export default function Diagnostico({ rotulo = "Ver diagnóstico completo" }: { rotulo?: string }) {
  const [dados, setDados] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  return (
    <>
      <button
        className="botao sec peq"
        disabled={carregando}
        onClick={async () => {
          setCarregando(true);
          try {
            const r = await fetch("/api/saude", { headers: await cabecalhosNuvem() });
            setDados(JSON.stringify(await r.json(), null, 2));
          } catch (e) {
            setDados(String(e));
          } finally {
            setCarregando(false);
          }
        }}
      >
        {carregando ? "Conferindo..." : rotulo}
      </button>
      {dados && (
        <div className="modal-fundo" onClick={() => setDados(null)}>
          <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <h3>Diagnóstico da configuração</h3>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, maxHeight: "60vh", overflowY: "auto" }}>{dados}</pre>
            <div className="linha" style={{ justifyContent: "flex-end" }}>
              <button className="botao" onClick={() => setDados(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
