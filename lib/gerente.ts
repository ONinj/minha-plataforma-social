"use client";

import type Anthropic from "@anthropic-ai/sdk";
import type { useStore } from "./store";
import { chamarClaude, custoEstimadoVideo, gerarImagem, iniciarVideo } from "./servicos";
import type { Aprovacao, MensagemClaude, TipoConteudo } from "./tipos";
import { agoraISO, blobParaBase64, brl, novoId, reduzirImagem } from "./util";

type Store = ReturnType<typeof useStore>;

export function systemGerente(perfilMarca: string): string {
  return `Você é o gerente de marketing de uma plataforma pessoal de gestão de redes sociais. Você conversa em português do Brasil com o dono das redes, que só dá ideias e aprova o que você entrega.

Sua equipe (você aciona pelas ferramentas):
- Gemini (ferramenta gerar_imagem): cria os criativos — cards do feed, stories, capas e as imagens de referência para os vídeos.
- Veo e Seedance (ferramenta gerar_video): geram os vídeos. Use o Veo como padrão por ser mais barato; use o Seedance só quando a cena pedir algo que o Veo não entrega bem ou quando o usuário pedir. Para manter o visual consistente, gere antes uma imagem de referência com o Gemini e passe o id dela em imagem_inicial.
- Aprovação (ferramenta enviar_para_aprovacao): tudo o que estiver pronto para publicar vai para a fila de aprovação, com legenda, hashtags, redes e data sugerida. Nada é publicado sem o "aprovado" do usuário.

Como trabalhar:
- Quando pedirem um planejamento mensal, primeiro proponha o calendário (datas, formatos, temas, objetivo de cada post) em uma tabela e envie o planejamento completo como um item do tipo "planejamento" para aprovação. Só produza as peças depois que o usuário aprovar ou pedir.
- Escreva prompts de imagem e vídeo detalhados (estilo, luz, enquadramento, cores, texto na arte, proporção). Prompts de vídeo devem descrever movimento de câmera, ação e duração.
- Revise cada imagem que o Gemini devolver (você recebe a imagem). Se não estiver boa, gere de novo com um prompt corrigido antes de mandar para aprovação, mas no máximo 2 tentativas por peça para não gastar à toa.
- Vídeos levam alguns minutos para ficar prontos; eles aparecem sozinhos na aprovação quando você incluir o id do vídeo nas mídias do item.
- Formatos: feed 4:5 ou 1:1, stories e reels 9:16.
- Seja direto e organizado. No fim de cada entrega, resuma o que foi feito e o que está esperando aprovação.
- Use listar_agendamentos para não repetir temas e para encaixar datas livres no calendário.

Perfil da marca / redes do usuário:
${perfilMarca.trim() || "(ainda não preenchido — pergunte ao usuário sobre nicho, público, tom de voz e redes quando for relevante)"}`;
}

export const FERRAMENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: "gerar_imagem",
    description:
      "Pede ao Gemini uma imagem (card, story, capa ou referência para vídeo). Devolve o id da mídia e a própria imagem para você revisar. Pode usar imagens já existentes como referência visual.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Nome curto da peça, ex.: 'Card dica 1 - semana 2'" },
        prompt: { type: "string", description: "Prompt detalhado para o Gemini" },
        proporcao: { type: "string", enum: ["1:1", "4:5", "9:16", "16:9", "3:4"] },
        referencias: {
          type: "array",
          items: { type: "string" },
          description: "Ids de mídias (imagens) para usar como referência visual",
        },
      },
      required: ["titulo", "prompt", "proporcao"],
    },
  },
  {
    name: "gerar_video",
    description:
      "Inicia a geração de um vídeo no Veo ou no Seedance. O vídeo leva alguns minutos; a ferramenta devolve o id da mídia imediatamente para você incluir na aprovação.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        provedor: { type: "string", enum: ["veo", "seedance"] },
        prompt: { type: "string", description: "Prompt detalhado: cena, ação, câmera, estilo, áudio" },
        proporcao: { type: "string", enum: ["9:16", "16:9"] },
        imagem_inicial: { type: "string", description: "Id de uma imagem para servir de primeiro quadro / referência" },
      },
      required: ["titulo", "provedor", "prompt", "proporcao"],
    },
  },
  {
    name: "enviar_para_aprovacao",
    description:
      "Coloca uma peça pronta (ou um planejamento) na fila de aprovação do usuário. Quando aprovada, ela vai automaticamente para a aba Agendamentos.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        tipo: { type: "string", enum: ["post", "carrossel", "reels", "story", "planejamento", "outro"] },
        redes: { type: "array", items: { type: "string" }, description: "Ex.: ['Instagram', 'TikTok']" },
        legenda: { type: "string", description: "Legenda completa, ou o planejamento completo em markdown" },
        hashtags: { type: "string" },
        data_publicacao: { type: "string", description: "Data e hora sugeridas no formato YYYY-MM-DDTHH:mm" },
        midias: { type: "array", items: { type: "string" }, description: "Ids das imagens/vídeos da peça, em ordem" },
        observacoes: { type: "string", description: "Notas para o usuário (ex.: música sugerida, como postar)" },
      },
      required: ["titulo", "tipo", "redes", "legenda"],
    },
  },
  {
    name: "listar_agendamentos",
    description: "Mostra o que já está aprovado/programado/postado no calendário e o que está esperando aprovação.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "listar_midias",
    description: "Lista as últimas mídias da biblioteca (ids, títulos, tipo e status), inclusive vídeos ainda em produção.",
    input_schema: { type: "object", properties: {} },
  },
];

type ResultadoFerramenta = Anthropic.Beta.BetaToolResultBlockParam;

async function executar(
  store: Store,
  bloco: Anthropic.Beta.BetaToolUseBlock,
  confirmar: (mensagem: string) => Promise<boolean>,
): Promise<ResultadoFerramenta> {
  const entrada = bloco.input as Record<string, unknown>;
  const ok = (content: ResultadoFerramenta["content"]): ResultadoFerramenta => ({
    type: "tool_result",
    tool_use_id: bloco.id,
    content,
  });
  const erro = (texto: string): ResultadoFerramenta => ({
    type: "tool_result",
    tool_use_id: bloco.id,
    content: texto,
    is_error: true,
  });

  try {
    switch (bloco.name) {
      case "gerar_imagem": {
        const { midias, texto } = await gerarImagem(store, {
          titulo: String(entrada.titulo ?? "Imagem"),
          prompt: String(entrada.prompt ?? ""),
          proporcao: entrada.proporcao as string | undefined,
          referencias: (entrada.referencias as string[] | undefined) ?? [],
        });
        const conteudo: Exclude<ResultadoFerramenta["content"], string | undefined> = [
          {
            type: "text",
            text: `Imagem gerada. ${midias.map((m) => `[midia:${m.id}]`).join(" ")}${texto ? `\nObservação do Gemini: ${texto}` : ""}`,
          },
        ];
        for (const m of midias) {
          const blob = await store.lerBlob(m.id);
          if (!blob) continue;
          const pequena = await reduzirImagem(blob, 640, 0.75);
          conteudo.push({
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: await blobParaBase64(pequena) },
          });
        }
        return ok(conteudo);
      }

      case "gerar_video": {
        const provedor = entrada.provedor === "seedance" ? "seedance" : "veo";
        const config = store.obter().config;
        if (config.confirmarVideos) {
          const custo = custoEstimadoVideo(config, provedor) * config.cambio;
          const aceito = await confirmar(
            `O gerente quer gerar um vídeo no ${provedor === "veo" ? "Veo" : "Seedance"}:\n\n"${String(entrada.titulo)}"\n\nCusto estimado: ${brl(custo)}. Autorizar?`,
          );
          if (!aceito) return erro("O usuário não autorizou a geração deste vídeo. Pergunte como ele prefere seguir.");
        }
        const midia = await iniciarVideo(store, {
          provedor,
          titulo: String(entrada.titulo ?? "Vídeo"),
          prompt: String(entrada.prompt ?? ""),
          proporcao: entrada.proporcao as string | undefined,
          imagemId: entrada.imagem_inicial as string | undefined,
        });
        return ok(`Vídeo em produção [midia:${midia.id}]. Fica pronto em alguns minutos; inclua este id nas mídias da aprovação.`);
      }

      case "enviar_para_aprovacao": {
        const item: Aprovacao = {
          id: novoId("apr"),
          titulo: String(entrada.titulo ?? "Sem título"),
          tipo: (entrada.tipo as TipoConteudo) ?? "post",
          redes: (entrada.redes as string[]) ?? [],
          legenda: String(entrada.legenda ?? ""),
          hashtags: String(entrada.hashtags ?? ""),
          dataPublicacao: entrada.data_publicacao as string | undefined,
          midias: (entrada.midias as string[]) ?? [],
          observacoes: entrada.observacoes as string | undefined,
          status: "pendente",
          criadoEm: agoraISO(),
        };
        const existentes = new Set(store.obter().midias.map((m) => m.id));
        const desconhecidas = item.midias.filter((id) => !existentes.has(id));
        if (desconhecidas.length) return erro(`Ids de mídia não encontrados: ${desconhecidas.join(", ")}`);
        store.atualizar((e) => ({ ...e, aprovacoes: [item, ...e.aprovacoes] }));
        return ok(`Enviado para aprovação (id ${item.id}).`);
      }

      case "listar_agendamentos": {
        const { agendamentos, aprovacoes } = store.obter();
        const resumo = {
          agendamentos: agendamentos.map((a) => ({
            titulo: a.titulo,
            tipo: a.tipo,
            redes: a.redes,
            data: a.data,
            status: a.status,
          })),
          aguardando_aprovacao: aprovacoes
            .filter((a) => a.status === "pendente" || a.status === "ajuste")
            .map((a) => ({ id: a.id, titulo: a.titulo, tipo: a.tipo, data: a.dataPublicacao, status: a.status, feedback: a.feedback })),
        };
        return ok(JSON.stringify(resumo, null, 1));
      }

      case "listar_midias": {
        const lista = store
          .obter()
          .midias.slice(0, 40)
          .map((m) => ({ id: m.id, tipo: m.tipo, titulo: m.titulo, origem: m.origem, status: m.status }));
        return ok(JSON.stringify(lista, null, 1));
      }

      default:
        return erro(`Ferramenta desconhecida: ${bloco.name}`);
    }
  } catch (e) {
    return erro(e instanceof Error ? e.message : String(e));
  }
}

function adicionarMensagem(store: Store, msg: MensagemClaude) {
  store.atualizar((e) => ({ ...e, chatGerente: [...e.chatGerente, msg] }));
}

/** Roda o gerente: o Claude conversa, aciona as ferramentas e repete até terminar a tarefa. */
export async function rodarGerente(
  store: Store,
  texto: string,
  confirmar: (mensagem: string) => Promise<boolean>,
  aoMudarEtapa: (etapa: string) => void,
) {
  const hoje = new Date().toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" });
  adicionarMensagem(store, { role: "user", content: `[Agora: ${hoje}]\n${texto}` });

  for (let volta = 0; volta < 25; volta++) {
    aoMudarEtapa(volta === 0 ? "Claude pensando..." : "Claude revisando os resultados...");
    const { chatGerente, config } = store.obter();
    const resposta = await chamarClaude(store, {
      system: systemGerente(config.perfilMarca),
      messages: chatGerente,
      tools: FERRAMENTAS,
      effort: config.esforcoGerente,
    });
    adicionarMensagem(store, { role: "assistant", content: resposta.content });

    if (resposta.stop_reason === "pause_turn") continue;
    if (resposta.stop_reason !== "tool_use") return resposta.stop_reason;

    const chamadas = resposta.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const resultados: ResultadoFerramenta[] = [];
    for (const chamada of chamadas) {
      aoMudarEtapa(descreverEtapa(chamada));
      resultados.push(await executar(store, chamada, confirmar));
    }
    adicionarMensagem(store, { role: "user", content: resultados });
  }
  return "limite";
}

function descreverEtapa(b: Anthropic.Beta.BetaToolUseBlock): string {
  const e = b.input as Record<string, unknown>;
  switch (b.name) {
    case "gerar_imagem":
      return `Gemini criando: ${e.titulo ?? "imagem"}...`;
    case "gerar_video":
      return `${e.provedor === "seedance" ? "Seedance" : "Veo"} recebendo o vídeo: ${e.titulo ?? ""}...`;
    case "enviar_para_aprovacao":
      return `Enviando para aprovação: ${e.titulo ?? ""}...`;
    default:
      return "Consultando a plataforma...";
  }
}
