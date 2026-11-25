"use client";

import { useEffect, useState } from "react";
import { rodarGerente } from "@/lib/gerente";
import { useStore } from "@/lib/store";
import type { Midia } from "@/lib/tipos";
import ChatClaudeView from "../ChatClaudeView";
import { CartaoMidia } from "../MidiaView";

const SUGESTOES = [
  "Monte o planejamento de dezembro para o meu Instagram: 3 posts por semana e stories diários.",
  "Crie 3 cards de feed sobre dicas do meu nicho, com a mesma identidade visual.",
  "Faça um reels de 8 segundos apresentando meu perfil, com uma imagem de referência antes.",
];

type PedidoReferencia = { midias: Midia[]; motivo: string; responder: (ok: boolean) => void };

export default function Gerente({
  pendente,
  anexosIniciais,
  aoConsumir,
  aoConsumirAnexos,
}: {
  pendente?: string;
  anexosIniciais?: string[];
  aoConsumir: () => void;
  aoConsumirAnexos: () => void;
}) {
  const store = useStore();
  const [ocupado, setOcupado] = useState(false);
  const [etapa, setEtapa] = useState<string>();
  const [erro, setErro] = useState<string>();
  const [pedido, setPedido] = useState<PedidoReferencia | null>(null);

  // Os anexos vindos da aba Mídias já foram para a caixa de envio; limpa o pedido.
  useEffect(() => {
    if (anexosIniciais?.length) aoConsumirAnexos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anexosIniciais]);

  // Mensagens vindas da aba Aprovações (ajustes, produzir planejamento).
  useEffect(() => {
    if (pendente && !ocupado) {
      aoConsumir();
      enviar(pendente, []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendente]);

  async function enviar(texto: string, anexos: string[]) {
    setErro(undefined);
    setOcupado(true);
    try {
      const fim = await rodarGerente(
        store,
        texto || "(enviei estes arquivos)",
        anexos,
        {
          confirmar: async (msg) => window.confirm(msg),
          aprovarReferencias: (midias, motivo) =>
            new Promise<boolean>((resolve) =>
              setPedido({
                midias,
                motivo,
                responder: (ok) => {
                  setPedido(null);
                  resolve(ok);
                },
              }),
            ),
        },
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
    <>
      <ChatClaudeView
        mensagens={store.estado.chatGerente}
        ocupado={ocupado}
        etapa={pedido ? "Esperando você aprovar a referência..." : etapa}
        erro={erro}
        permitirAnexos
        anexosIniciais={anexosIniciais}
        placeholder="Dê a ideia, peça o planejamento ou anexe fotos/vídeos com 📎 (Enter envia)"
        aoEnviar={enviar}
        boasVindas={
          <div className="cartao" style={{ maxWidth: 720 }}>
            <h3>Central: fale com o gerente</h3>
            <p className="ajuda">
              Aqui você conversa só com o Claude. Ele planeja, escreve os prompts, manda criar as imagens e os vídeos,
              revisa tudo e coloca na aba <b>Aprovações</b>. Você só aprova.
            </p>
            <p className="ajuda">
              Use o <b>📎</b> para mandar fotos e vídeos reais (ex.: foto de um produto) e pedir para animar ou publicar.
              Antes de usar uma imagem feita por IA como referência, ele pede a sua aprovação.
            </p>
            <p className="ajuda">Experimente:</p>
            <div className="lista" style={{ gap: 8 }}>
              {SUGESTOES.map((s) => (
                <button key={s} className="botao sec" style={{ textAlign: "left" }} onClick={() => enviar(s, [])}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        }
      />
      {pedido && (
        <div className="modal-fundo">
          <div className="modal">
            <h3 style={{ marginTop: 0 }}>Aprovar imagem como referência?</h3>
            <p className="ajuda">
              O gerente quer usar {pedido.midias.length > 1 ? "estas imagens feitas por IA" : "esta imagem feita por IA"}{" "}
              como referência {pedido.motivo}. Depois de aprovada, ela fica liberada para as próximas vezes.
            </p>
            <div className="grade-midias" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", marginBottom: 16 }}>
              {pedido.midias.map((m) => (
                <CartaoMidia key={m.id} midia={m} />
              ))}
            </div>
            <div className="linha" style={{ justifyContent: "flex-end" }}>
              <button className="botao perigo" onClick={() => pedido.responder(false)}>
                Não usar
              </button>
              <button className="botao ok" onClick={() => pedido.responder(true)}>
                ✓ Aprovar como referência
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
