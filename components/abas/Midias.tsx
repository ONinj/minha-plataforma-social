"use client";

import { useState } from "react";
import { db } from "@/lib/db";
import { useStore } from "@/lib/store";
import { formatarData } from "@/lib/util";
import { BotaoBaixar, CartaoMidia } from "../MidiaView";
import { BotaoUpload } from "../SeletorMidias";

export default function Midias() {
  const store = useStore();
  const [filtro, setFiltro] = useState<"todas" | "imagem" | "video">("todas");
  const midias = store.estado.midias.filter((m) => filtro === "todas" || m.tipo === filtro);

  async function excluir(id: string) {
    if (!window.confirm("Excluir esta mídia?")) return;
    await db.apagar(`blob:${id}`);
    store.atualizar((e) => ({ ...e, midias: e.midias.filter((m) => m.id !== id) }));
  }

  return (
    <div className="conteudo">
      <div className="linha" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div className="filtros" style={{ margin: 0 }}>
          {(["todas", "imagem", "video"] as const).map((f) => (
            <button key={f} className={`filtro ${filtro === f ? "ativo" : ""}`} onClick={() => setFiltro(f)}>
              {f === "todas" ? "Todas" : f === "imagem" ? "Imagens" : "Vídeos"}
            </button>
          ))}
        </div>
        <BotaoUpload rotulo="+ Enviar arquivos" />
      </div>
      {midias.length === 0 ? (
        <p className="vazio">A biblioteca está vazia. Tudo o que o Gemini, o Veo e o Seedance criarem aparece aqui.</p>
      ) : (
        <div className="grade-midias">
          {midias.map((m) => (
            <div key={m.id} title={m.prompt}>
              <CartaoMidia
                midia={m}
                acoes={
                  <>
                    <BotaoBaixar midia={m} />
                    <button className="botao perigo peq" onClick={() => excluir(m.id)}>
                      Excluir
                    </button>
                  </>
                }
              />
              <p className="ajuda" style={{ margin: "4px 2px" }}>
                {formatarData(m.criadoEm)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
