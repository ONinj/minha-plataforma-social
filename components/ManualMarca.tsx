"use client";

import { useRef, useState } from "react";
import { chamarClaude } from "@/lib/servicos";
import { useStore } from "@/lib/store";
import CriarPerfil from "./CriarPerfil";
import Icone from "./Icone";

const LIMITE_MB = 3;

/** Texto para a pessoa pedir, no Claude que ela já usa, um manual com tudo o que ele sabe da marca. */
const PEDIDO_PARA_O_CLAUDE = `Com base em tudo o que conversamos, crie um documento em PDF chamado "Manual da marca" com:
1. Empresa: nome, o que faz, cidade/região, história em poucas linhas.
2. Público: quem compra, idade, interesses, dores e desejos.
3. Tom de voz: como eu falo, expressões que uso, palavras que evito, uso de emojis.
4. Identidade visual: cores (com código HEX), fontes, como é o logo, estilo das fotos e artes.
5. Produtos e diferenciais: principais produtos/serviços, preços médios, o que nos diferencia.
6. Conteúdo: formatos que funcionam, frequência, temas, chamadas para ação, hashtags.
7. Estilo de vídeo: ritmo dos cortes, legendas, música, duração, ganchos que eu gosto.
8. Regras: o que nunca pode aparecer ou ser dito.
9. Exemplos: legendas e posts que aprovei.
Onde você não tiver a informação, escreva "a definir".`;

const SISTEMA = `Você organiza manuais de marca para uma plataforma de social media. Leia o PDF e responda SOMENTE com um JSON válido, sem texto antes ou depois:
{"guia": "...", "faltando": ["...", "..."], "modelo_em_branco": false}
- "guia": guia da marca em markdown, em português, até 5.000 caracteres, com as seções: ## Empresa, ## Público, ## Tom de voz, ## Identidade visual, ## Produtos e diferenciais, ## Conteúdo e formatos, ## Estilo de vídeo, ## Regras, ## Exemplos aprovados, ## A definir. Use só o que está no PDF; não invente. O que não estiver no PDF vai para "A definir".
- "faltando": as informações importantes que não estão no PDF, como perguntas curtas para o dono da marca (no máximo 15, das mais importantes para as menos).
- "modelo_em_branco": true se o PDF for um modelo/questionário sem respostas preenchidas.`;

function paraBase64(arquivo: File): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => falha(new Error("Não consegui ler o arquivo."));
    r.readAsDataURL(arquivo);
  });
}

type Store = ReturnType<typeof useStore>;

/** Lê o manual em PDF, salva o guia no perfil e manda o gerente perguntar o que falta. Devolve true se deu certo. */
export async function lerManualPdf(store: Store, arquivo: File, falarComGerente: (t: string) => void): Promise<boolean> {
  const marca = store.marca;
  if (arquivo.type !== "application/pdf" && !arquivo.name.toLowerCase().endsWith(".pdf")) {
    store.avisar("Envie o manual em PDF.", "erro");
    return false;
  }
  if (arquivo.size > LIMITE_MB * 1024 * 1024) {
    store.avisar(`O PDF tem mais de ${LIMITE_MB} MB. Salve uma versão mais leve (menos imagens ou "reduzir tamanho") e envie de novo.`, "erro");
    return false;
  }
  try {
    const dados = await paraBase64(arquivo);
    const r = await chamarClaude(store, {
      system: SISTEMA,
      modelo: "claude-sonnet-5-5",
      uso: "Manual da marca",
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: dados } },
            { type: "text", text: `Manual do perfil "${marca.nome}". Monte o guia e a lista do que falta.` },
          ],
        },
      ],
    });
    const bruto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const res = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as { guia?: string; faltando?: string[]; modelo_em_branco?: boolean };
    const guia = String(res.guia ?? "").trim();
    store.editarMarca(marca.id, { guia, guiaArquivo: { nome: arquivo.name, em: new Date().toISOString() } });
    const faltando = (res.faltando ?? []).filter(Boolean);
    store.avisar("Manual lido! O gerente vai te fazer algumas perguntas para completar o guia.", "ok");
    falarComGerente(
      res.modelo_em_branco
        ? `Enviei o manual-modelo da marca "${marca.nome}", ainda sem as respostas. Me entreviste para montar o guia da marca do zero, começando pelo mais importante, e salve o guia a cada rodada.`
        : `Enviei o manual da marca "${marca.nome}" (${arquivo.name}) e o guia já está salvo no perfil.` +
            (faltando.length
              ? ` Ficaram faltando estas informações:\n${faltando.map((f) => `- ${f}`).join("\n")}\nMe pergunte o que falta (em rodadas curtas) e atualize o guia com as minhas respostas.`
              : " Confira se ficou tudo certo e me diga se falta alguma coisa importante."),
    );
    return true;
  } catch (e) {
    store.avisar(`Não consegui ler o manual: ${e instanceof Error ? e.message : e}`, "erro");
    return false;
  }
}

/** Perfis e redes → Manual da marca: o gerente lê o PDF, monta o guia e entrevista o usuário sobre o que falta. */
export default function ManualMarca({ falarComGerente }: { falarComGerente: (t: string) => void }) {
  const store = useStore();
  const { marca } = store;
  const input = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState(false);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(marca.guia ?? "");
  const [copiado, setCopiado] = useState(false);
  const [questionario, setQuestionario] = useState(false);

  async function enviar(arquivo: File) {
    setLendo(true);
    await lerManualPdf(store, arquivo, falarComGerente);
    setLendo(false);
  }

  return (
    <div className="cartao" style={{ marginBottom: 18, borderColor: marca.guia ? "rgba(139,92,246,.45)" : undefined }}>
      <h3>
        <Icone nome="estrela" /> Manual da marca
      </h3>
      <p className="ajuda" style={{ marginTop: -4 }}>
        Envie o manual da marca em PDF. O gerente lê, monta o <b>guia da marca</b> (tom de voz, cores, estilo, regras) e te pergunta o
        que faltar. Depois, tudo o que ele criar segue esse guia.
      </p>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void enviar(f);
        }}
      />
      <div className="linha" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="botao" disabled={lendo} onClick={() => input.current?.click()}>
          {lendo ? "Lendo o manual..." : marca.guia ? "Enviar outro manual (PDF)" : "Enviar manual da marca (PDF)"}
        </button>
        <button className="botao sec" disabled={lendo} onClick={() => setQuestionario(true)}>
          {marca.respostasPerfil ? "Refazer o questionário" : "Não tenho manual: responder o questionário"}
        </button>
        <a className="botao sec" href="/manual-da-marca-galhos.pdf" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
          <Icone nome="baixar" tamanho={15} /> Baixar modelo de manual
        </a>
      </div>
      <details style={{ marginTop: 10 }}>
        <summary className="ajuda" style={{ cursor: "pointer" }}>Já conversa com o Claude sobre essa marca? Gere o manual por lá</summary>
        <p className="ajuda">Cole este pedido na conversa que você já tem no Claude, baixe o PDF que ele criar e envie aqui:</p>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "var(--painel)", padding: 10, borderRadius: 10, border: "1px solid var(--borda)" }}>
          {PEDIDO_PARA_O_CLAUDE}
        </pre>
        <button
          className="botao sec peq"
          onClick={async () => {
            await navigator.clipboard.writeText(PEDIDO_PARA_O_CLAUDE);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
        >
          <Icone nome="copiar" tamanho={14} /> {copiado ? "Copiado!" : "Copiar pedido"}
        </button>
      </details>

      {questionario && (
        <div className="modal-fundo" style={{ alignItems: "flex-start", overflowY: "auto", padding: "24px 12px" }}>
          <div style={{ width: "100%", maxWidth: 760 }}>
            <CriarPerfil falarComGerente={falarComGerente} aoFechar={() => setQuestionario(false)} />
          </div>
        </div>
      )}

      {marca.guia && (
        <div style={{ marginTop: 14 }}>
          <div className="linha" style={{ justifyContent: "space-between" }}>
            <b>Guia da marca {marca.guiaArquivo ? <span className="ajuda">· de {marca.guiaArquivo.nome}</span> : null}</b>
            <div className="linha" style={{ gap: 6 }}>
              <button
                className="botao sec peq"
                onClick={() => {
                  if (editando) {
                    store.editarMarca(marca.id, { guia: texto });
                    store.avisar("Guia salvo.", "ok");
                  } else setTexto(marca.guia ?? "");
                  setEditando(!editando);
                }}
              >
                {editando ? "Salvar" : "Editar"}
              </button>
              <button
                className="botao perigo peq"
                onClick={() => {
                  if (window.confirm("Apagar o guia da marca deste perfil?")) store.editarMarca(marca.id, { guia: "", guiaArquivo: undefined });
                }}
              >
                Apagar
              </button>
            </div>
          </div>
          {editando ? (
            <textarea rows={14} value={texto} onChange={(e) => setTexto(e.target.value)} style={{ marginTop: 8 }} />
          ) : (
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, maxHeight: 280, overflowY: "auto", margin: "8px 0 0", color: "var(--texto-2)" }}>
              {marca.guia}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
