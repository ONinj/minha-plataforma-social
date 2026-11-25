"use client";

import type Anthropic from "@anthropic-ai/sdk";
import type { useStore } from "./store";
import { chamarClaude, custoEstimadoVideo, gerarImagem, iniciarVideo } from "./servicos";
import type { Aprovacao, MensagemClaude, Midia, TipoConteudo } from "./tipos";
import { mensagemDePerfil, textoDoPerfil } from "./perfil";
import { agoraISO, blobParaBase64, brl, novoId, reduzirImagem } from "./util";

type Store = ReturnType<typeof useStore>;

export type Interacoes = {
  /** Pergunta sim/não (ex.: custo de um vídeo). */
  confirmar: (mensagem: string) => Promise<boolean>;
  /** Mostra imagens feitas por IA e pede autorização para usá-las como referência. */
  aprovarReferencias: (midias: Midia[], motivo: string) => Promise<boolean>;
};

/**
 * Imagens feitas por IA só viram referência com o OK do usuário. Fotos e vídeos que o
 * próprio usuário enviou já estão liberados. Devolve uma mensagem de erro, ou null se puder seguir.
 */
async function checarReferencias(
  store: Store,
  ids: string[],
  motivo: string,
  interacoes: Interacoes,
): Promise<string | null> {
  const midias = store.obter().midias;
  const faltando = ids.filter((id) => !midias.some((m) => m.id === id));
  if (faltando.length) return `Ids de mídia não encontrados: ${faltando.join(", ")}`;
  const usadas = ids.map((id) => midias.find((m) => m.id === id)!);
  const naoImagem = usadas.filter((m) => m.tipo !== "imagem" || m.status !== "pronto");
  if (naoImagem.length) return `Só imagens prontas podem ser referência: ${naoImagem.map((m) => m.id).join(", ")}`;
  const pendentes = usadas.filter((m) => m.origem !== "upload" && !m.referenciaAprovada);
  if (!pendentes.length) return null;
  const ok = await interacoes.aprovarReferencias(pendentes, motivo);
  if (!ok) {
    return `O usuário NÃO aprovou ${pendentes.map((m) => `[midia:${m.id}]`).join(" ")} como referência. Não use essas imagens como referência; pergunte como ele prefere seguir (outra imagem, gerar de novo ou sem referência).`;
  }
  const aprovados = new Set(pendentes.map((m) => m.id));
  store.atualizar((e) => ({
    ...e,
    midias: e.midias.map((m) => (aprovados.has(m.id) ? { ...m, referenciaAprovada: true } : m)),
  }));
  return null;
}

// O texto de sistema nunca muda durante a conversa (exigência do Claude para manter o
// raciocínio salvo válido). O perfil da marca entra como mensagem de sistema na conversa.
export const SYSTEM_GERENTE = `Você é o gerente de marketing de uma plataforma de gestão de redes sociais usada por social medias. Você conversa em português do Brasil com quem cuida do perfil, que só dá ideias e aprova o que você entrega. Cada conversa é de um único perfil (marca/cliente).

Sua equipe (você aciona pelas ferramentas):
- Nano Banana 2 (ferramenta gerar_imagem): cria os criativos — cards do feed, stories, capas e as imagens de referência para os vídeos.
- Veo e Seedance (ferramenta gerar_video): geram os vídeos. Use o Veo como padrão por ser mais barato; use o Seedance só quando a cena pedir algo que o Veo não entrega bem ou quando o usuário pedir. Para manter o visual consistente, gere antes uma imagem de referência e passe o id dela em imagem_inicial. Fotos reais enviadas pelo usuário são ótimas imagens iniciais (ex.: animar a foto de um produto).
- Aprovação (ferramenta enviar_para_aprovacao): tudo o que estiver pronto para publicar vai para a fila de aprovação, com legenda, hashtags, redes e data sugerida. Nada é publicado sem o "aprovado" do usuário.

Como trabalhar:
- Quando pedirem um planejamento mensal, primeiro proponha o calendário (datas, formatos, temas, objetivo de cada post) em uma tabela e envie o planejamento completo como um item do tipo "planejamento" para aprovação. Só produza as peças depois que o usuário aprovar ou pedir.
- Escreva prompts de imagem e vídeo detalhados (estilo, luz, enquadramento, cores, texto na arte, proporção). Prompts de vídeo devem descrever movimento de câmera, ação e duração.
- Imagens feitas por IA só podem ser usadas como referência com aprovação do usuário; a plataforma pede essa aprovação automaticamente quando você tentar usar. Fotos enviadas pelo usuário já estão liberadas.
- Revise cada imagem gerada (você recebe a imagem). Se não estiver boa, gere de novo com um prompt corrigido antes de mandar para aprovação, mas no máximo 2 tentativas por peça para não gastar à toa.
- Vídeos levam alguns minutos para ficar prontos; eles aparecem sozinhos na aprovação quando você incluir o id do vídeo nas mídias do item.
- Formatos: feed 4:5 ou 1:1, stories e reels 9:16.
- Seja direto e organizado. No fim de cada entrega, resuma o que foi feito e o que está esperando aprovação.
- Use listar_agendamentos para não repetir temas e para encaixar datas livres no calendário.
- O perfil da marca chega em mensagens de sistema ao longo da conversa; vale sempre o mais recente. Se não houver perfil, pergunte ao usuário sobre nicho, público, tom de voz e redes quando for relevante.`;

export const FERRAMENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: "gerar_imagem",
    description:
      "Gera uma imagem com o Nano Banana 2 (card, story, capa ou referência para vídeo). Devolve o id da mídia e a própria imagem para você revisar. Pode usar imagens já existentes como referência visual.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Nome curto da peça, ex.: 'Card dica 1 - semana 2'" },
        prompt: { type: "string", description: "Prompt detalhado para o gerador de imagens" },
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
  interacoes: Interacoes,
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
        const refs = (entrada.referencias as string[] | undefined) ?? [];
        if (refs.length) {
          const problema = await checarReferencias(store, refs, `para criar "${String(entrada.titulo ?? "imagem")}"`, interacoes);
          if (problema) return erro(problema);
        }
        const { midias, texto } = await gerarImagem(store, {
          titulo: String(entrada.titulo ?? "Imagem"),
          prompt: String(entrada.prompt ?? ""),
          proporcao: entrada.proporcao as string | undefined,
          referencias: refs,
        });
        const conteudo: Exclude<ResultadoFerramenta["content"], string | undefined> = [
          {
            type: "text",
            text: `Imagem gerada. ${midias.map((m) => `[midia:${m.id}]`).join(" ")}${texto ? `\nObservação do gerador: ${texto}` : ""}`,
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
        const inicial = entrada.imagem_inicial as string | undefined;
        if (inicial) {
          const problema = await checarReferencias(store, [inicial], `no vídeo "${String(entrada.titulo ?? "vídeo")}" (como primeiro quadro)`, interacoes);
          if (problema) return erro(problema);
        }
        if (config.confirmarVideos) {
          const custo = custoEstimadoVideo(config, provedor) * config.cambio;
          const aceito = await interacoes.confirmar(
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
          pedidoPor: "gerente",
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
  anexos: string[],
  interacoes: Interacoes,
  aoMudarEtapa: (etapa: string) => void,
) {
  const hoje = new Date().toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" });
  const tamanhoAntes = store.obter().chatGerente.length;
  adicionarMensagem(store, { role: "user", content: await montarMensagem(store, `[Agora: ${hoje}]\n${texto}`, anexos) });
  const perfil = mensagemDePerfil(store.obter().chatGerente, textoDoPerfil(store));
  if (perfil) adicionarMensagem(store, perfil);

  for (let volta = 0; volta < 25; volta++) {
    aoMudarEtapa(volta === 0 ? "Claude pensando..." : "Claude revisando os resultados...");
    const { chatGerente, config } = store.obter();
    let resposta;
    try {
      resposta = await chamarClaude(store, {
        system: SYSTEM_GERENTE,
        messages: chatGerente,
        tools: FERRAMENTAS,
        effort: config.esforcoGerente,
      });
    } catch (e) {
      // Se falhou logo na primeira chamada, desfaz a mensagem enviada para a conversa
      // continuar válida (só mexe no fim do histórico, nunca no meio).
      if (volta === 0) store.atualizar((est) => ({ ...est, chatGerente: est.chatGerente.slice(0, tamanhoAntes) }));
      throw e;
    }
    adicionarMensagem(store, { role: "assistant", content: resposta.content });

    if (resposta.stop_reason === "pause_turn") continue;
    if (resposta.stop_reason !== "tool_use") return resposta.stop_reason;

    const chamadas = resposta.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const resultados: ResultadoFerramenta[] = [];
    for (const chamada of chamadas) {
      aoMudarEtapa(descreverEtapa(chamada));
      resultados.push(await executar(store, chamada, interacoes));
    }
    adicionarMensagem(store, { role: "user", content: resultados });
  }
  return "limite";
}

function descreverEtapa(b: Anthropic.Beta.BetaToolUseBlock): string {
  const e = b.input as Record<string, unknown>;
  switch (b.name) {
    case "gerar_imagem":
      return `Nano Banana criando: ${e.titulo ?? "imagem"}...`;
    case "gerar_video":
      return `${e.provedor === "seedance" ? "Seedance" : "Veo"} recebendo o vídeo: ${e.titulo ?? ""}...`;
    case "enviar_para_aprovacao":
      return `Enviando para aprovação: ${e.titulo ?? ""}...`;
    default:
      return "Consultando a plataforma...";
  }
}

/** Monta a mensagem do usuário com as fotos/vídeos anexados (o Claude vê as fotos). */
async function montarMensagem(
  store: Store,
  texto: string,
  anexos: string[],
): Promise<Anthropic.Beta.BetaMessageContentParam> {
  if (!anexos.length) return texto;
  const blocos: Exclude<Anthropic.Beta.BetaMessageContentParam, string> = [];
  for (const id of anexos) {
    const m = store.obter().midias.find((x) => x.id === id);
    if (!m) continue;
    const origem = m.origem === "upload" ? "enviada pelo usuário (foto/vídeo real, liberada para referência)" : `gerada por IA (${m.origem})`;
    if (m.tipo === "video") {
      blocos.push({
        type: "text",
        text: `[midia:${m.id}] Vídeo "${m.titulo}", ${origem}. Você não consegue assistir a vídeos; use o id para enviar à aprovação/publicação.`,
      });
      continue;
    }
    blocos.push({ type: "text", text: `[midia:${m.id}] Imagem "${m.titulo}", ${origem}:` });
    const blob = await store.lerBlob(m.id);
    if (blob) {
      const pequena = await reduzirImagem(blob, 1024, 0.8);
      blocos.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await blobParaBase64(pequena) } });
    }
  }
  blocos.push({ type: "text", text: texto });
  return blocos;
}
