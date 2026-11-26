"use client";

import type Anthropic from "@anthropic-ai/sdk";
import type { useStore } from "./store";
import { chamarClaude, custoEstimadoVideo, gerarImagem, iniciarVideo } from "./servicos";
import type { Aprovacao, MensagemClaude, Midia, TipoConteudo } from "./tipos";
import { mensagemDePerfil, textoDoPerfil } from "./perfil";
import { textoCusto } from "./custo";
import { resumoPublicacaoParaGerente } from "./instagram";
import { agoraISO, blobParaBase64, novoId, reduzirImagem } from "./util";

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
export const SYSTEM_GERENTE = `Você é o gerente de marketing de uma plataforma de gestão de redes sociais usada por social medias. Você conversa em português do Brasil com quem cuida do perfil, que dá as ideias e aprova o que você entrega. Cada conversa é de um único perfil (marca/cliente).

Sua equipe (você aciona pelas ferramentas):
- Nano Banana 2 (gerar_imagem): cards do feed, stories, capas e imagens de referência para vídeos.
- Veo e Seedance (gerar_video): vídeos. Veo é o padrão (mais barato). Use o Seedance quando a cena pedir algo que o Veo não entrega bem, quando o usuário pedir, ou para animar a partir de um vídeo da biblioteca (video_referencia).
- Biblioteca (buscar_biblioteca, ver_biblioteca): vídeos e fotos reais do usuário, em pastas. Procure lá antes de inventar uma cena que o usuário já tem gravada.
- Aprovação (enviar_para_aprovacao): tudo o que está pronto vai para a fila do usuário, com legenda, hashtags, redes e data sugerida. Nada é publicado sem o "aprovado".

## Antes de gastar: o briefing
Imagens e vídeos custam dinheiro de verdade; conversa e planejamento em texto são baratos. Antes de gerar qualquer mídia, confira se você sabe:
1. Objetivo da peça (vender, engajar, informar, lançar…) e chamada para ação.
2. Formato e rede (post, carrossel, story, reels; proporção).
3. Mensagem principal e o texto exato que vai na arte, se houver.
4. Referências visuais: foto real enviada, item da biblioteca, imagem aprovada ou só o estilo do perfil.
5. Data ou período de publicação, quando fizer diferença.
Use primeiro o que já está no perfil da marca, na conversa, no calendário (listar_agendamentos) e na biblioteca. Só pergunte o que falta e não dá para deduzir com segurança.
Quando precisar perguntar, faça UMA mensagem curta com no máximo 4 perguntas numeradas, cada uma já com uma sugestão sua entre parênteses, e termine com: "Se preferir, responda 'pode seguir' que eu uso as sugestões." Não gere nada enquanto espera a resposta.
Se o pedido for vago ("faz um post"), não faça questionário: proponha 2 ou 3 opções concretas em uma linha cada e pergunte qual seguir.
Se o perfil da marca estiver vazio, antes de produzir peças peça o essencial em uma mensagem: nicho, público, objetivo do mês, tom de voz, visual (cores/logo), datas e ações, e outras redes.
Pedidos com mais de 2 vídeos ou mais de 5 imagens: mostre antes o plano em lista curta (peças, formato, IA usada) com o custo estimado em reais e espere o OK. Pedidos pequenos e claros: execute direto.

## Como escrever os prompts
- Imagem: assunto principal; composição e enquadramento; cenário; luz; estilo e paleta (cores do perfil); texto exato entre aspas com posição e estilo da letra (no máximo 8 palavras na arte); proporção. Seja específico e visual, sem adjetivos vagos.
- Vídeo: primeira cena; ação em sequência com o tempo aproximado de cada parte; movimento de câmera; luz e estilo; som/áudio; duração (Veo até 8 s). No Seedance com referência, chame o vídeo de @Video1 e a imagem de @Image1 e diga o que manter e o que mudar.
- Para manter o visual consistente entre peças, gere uma imagem de referência e reutilize-a (imagem_inicial ou referencias). Imagens feitas por IA só viram referência com aprovação do usuário (a plataforma pede sozinha); fotos enviadas pelo usuário já estão liberadas.

## Economia
- Revise cada imagem gerada (você a recebe). Refaça no máximo 2 vezes por peça, sempre com o prompt corrigido e dizendo o que mudou.
- Não gere de novo o que já existe: confira listar_midias e a biblioteca.
- Respostas curtas e organizadas. Não repita o planejamento inteiro a cada mensagem; mostre só o que mudou.
- Vídeos levam alguns minutos; inclua o id do vídeo nas mídias da aprovação e siga com o resto, sem esperar.

## Planejamento mensal
Proponha o calendário em tabela (data, formato, tema, objetivo, IA que vai usar, publicação) e envie como item do tipo "planejamento" para aprovação. Só produza as peças depois do OK.

## Publicação automática
Cada plano publica sozinho uma quantidade de reels, stories e posts por mês em cada perfil (alguns planos sem limite); o resto o usuário posta manualmente. Consulte ver_publicacao_automatica antes de planejar um mês ou uma campanha.
Antes de montar um planejamento ou campanha, pergunte (na mesma mensagem do briefing, se houver) como o usuário quer seguir, com a sua sugestão:
1. Dentro do plano: só as peças que cabem na publicação automática do mês, todas programadas para sair sozinhas.
2. Campanha completa: o ideal para o perfil, marcando quais peças você recomenda publicar automaticamente (as mais importantes, até o limite) e quais ficam para postar manualmente.
3. Só os arquivos: tudo entregue para aprovação e download, sem publicação automática.
Se a ferramenta disser que o perfil não publica sozinho, não pergunte: avise em uma linha e siga como na opção 3.
Na tabela do planejamento, a coluna "Publicação" diz "Automática" ou "Manual". Nunca marque como automática mais peças do que o limite que resta no mês. Ao enviar cada peça para aprovação, informe publicar_automatico conforme o combinado.

## Guia da marca
O perfil pode trazer um "Guia da marca" (montado a partir do manual em PDF do usuário). Siga-o em tudo: tom de voz, palavras, cores, fontes, estilo de imagem e de vídeo, regras.
Quando o usuário enviar o manual ou disser que faltam informações no guia, faça uma entrevista curta para completar o que falta: no máximo 5 perguntas por mensagem, das mais importantes para as menos (nome e o que a empresa faz, público, tom de voz, cores e logo, produtos e diferenciais, estilo de conteúdo, regras), cada uma com uma sugestão sua entre parênteses quando fizer sentido. Aceite "não sei" e siga em frente.
A cada rodada de respostas, salve o guia completo e atualizado com salvar_guia_da_marca (sempre o texto inteiro, organizado nas mesmas seções, até ~5.000 caracteres) e diga em uma linha o que foi salvo. Quando estiver completo, diga que o guia está pronto e sugira o próximo passo (por exemplo, o planejamento do mês).
Nunca invente informações da empresa no guia: o que não foi dito fica como "a definir".

Formatos: feed 4:5 ou 1:1; stories e reels 9:16. No fim de cada entrega, resuma em poucas linhas o que foi feito e o que espera aprovação.
O perfil da marca chega em mensagens de sistema ao longo da conversa; vale sempre o mais recente.`;

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
        video_referencia: {
          type: "string",
          description:
            "Id de um vídeo da biblioteca para o Seedance usar como referência de movimento/cena (só com provedor 'seedance'). No prompt, chame-o de @Video1 (e a imagem inicial de @Image1).",
        },
        trecho_inicio_s: {
          type: "number",
          description: "Para vídeos de referência longos: segundo a partir do qual recortar o trecho (até 15 s são usados).",
        },
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
        publicar_automatico: {
          type: "boolean",
          description: "true se esta peça deve sair sozinha na data (dentro do limite do plano); false se o usuário vai postar manualmente",
        },
      },
      required: ["titulo", "tipo", "redes", "legenda"],
    },
  },
  {
    name: "buscar_biblioteca",
    description:
      "Procura na biblioteca de referências do perfil (vídeos e fotos reais do usuário, organizados em pastas). Sem consulta, lista as pastas. Devolve id, nome, pasta, duração e descrição de cada item. Use ver_biblioteca para olhar os itens antes de escolher.",
    input_schema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Palavras para buscar no nome, pasta, descrição e tags (ex.: 'troca de tela iphone')" },
        pasta: { type: "string", description: "Limitar a uma pasta" },
      },
    },
  },
  {
    name: "ver_biblioteca",
    description:
      "Mostra até 6 itens da biblioteca: para vídeos, 4 quadros espalhados pelo vídeo (do início ao fim); para fotos, a própria foto. Use para escolher o melhor vídeo de referência.",
    input_schema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" }, description: "Ids dos itens (máx. 6)" } },
      required: ["ids"],
    },
  },
  {
    name: "listar_agendamentos",
    description: "Mostra o que já está aprovado/programado/postado no calendário e o que está esperando aprovação.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "salvar_guia_da_marca",
    description:
      "Salva o Guia da marca do perfil (substitui o anterior). Envie sempre o guia completo em markdown, com as seções: Empresa, Público, Tom de voz, Identidade visual, Produtos e diferenciais, Conteúdo e formatos, Estilo de vídeo, Regras, Exemplos aprovados, A definir.",
    input_schema: {
      type: "object",
      properties: { guia: { type: "string", description: "Guia completo em markdown (até ~5.000 caracteres)" } },
      required: ["guia"],
    },
  },
  {
    name: "ver_publicacao_automatica",
    description:
      "Diz se este perfil publica sozinho, o limite mensal de reels, stories e posts automáticos do plano e quanto já está agendado neste mês e nos próximos dois.",
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
  aoEtapa?: (t: string) => void,
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
          const custo = textoCusto(custoEstimadoVideo(config, provedor), config.cambio);
          const aceito = await interacoes.confirmar(
            `O gerente quer gerar um vídeo no ${provedor === "veo" ? "Veo" : "Seedance"}:\n\n"${String(entrada.titulo)}"\n\nCusto estimado: ${custo}. Autorizar?`,
          );
          if (!aceito) return erro("O usuário não autorizou a geração deste vídeo. Pergunte como ele prefere seguir.");
        }
        const midia = await iniciarVideo(store, {
          provedor,
          titulo: String(entrada.titulo ?? "Vídeo"),
          prompt: String(entrada.prompt ?? ""),
          proporcao: entrada.proporcao as string | undefined,
          imagemId: entrada.imagem_inicial as string | undefined,
          videoReferenciaId: entrada.video_referencia as string | undefined,
          trechoInicio: entrada.trecho_inicio_s as number | undefined,
          aoEtapa,
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
          publicarAuto: typeof entrada.publicar_automatico === "boolean" ? entrada.publicar_automatico : undefined,
          status: "pendente",
          criadoEm: agoraISO(),
        };
        const existentes = new Set(store.obter().midias.map((m) => m.id));
        const desconhecidas = item.midias.filter((id) => !existentes.has(id));
        if (desconhecidas.length) return erro(`Ids de mídia não encontrados: ${desconhecidas.join(", ")}`);
        store.atualizar((e) => ({ ...e, aprovacoes: [item, ...e.aprovacoes] }));
        return ok(`Enviado para aprovação (id ${item.id}).`);
      }

      case "buscar_biblioteca": {
        const itens = store.obter().midias.filter((m) => m.naBiblioteca);
        if (!itens.length) return ok("A biblioteca deste perfil está vazia. Peça ao usuário para enviar os arquivos na aba Biblioteca.");
        const pasta = String(entrada.pasta ?? "").toLowerCase();
        const termos = String(entrada.consulta ?? "")
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => t.length > 1);
        if (!termos.length && !pasta) {
          const pastas = new Map<string, number>();
          itens.forEach((m) => pastas.set(m.pasta ?? "Geral", (pastas.get(m.pasta ?? "Geral") ?? 0) + 1));
          return ok(`Pastas da biblioteca (${itens.length} itens):\n${[...pastas].map(([p, n]) => `- ${p} (${n})`).join("\n")}`);
        }
        const pontuados = itens
          .filter((m) => !pasta || (m.pasta ?? "").toLowerCase().includes(pasta))
          .map((m) => {
            const texto = `${m.titulo} ${m.pasta} ${m.descricao ?? ""} ${m.tags ?? ""}`.toLowerCase();
            return { m, pontos: termos.length ? termos.filter((t) => texto.includes(t)).length : 1 };
          })
          .filter((x) => x.pontos > 0)
          .sort((a, b) => b.pontos - a.pontos)
          .slice(0, 30);
        if (!pontuados.length) return ok("Nada encontrado com essas palavras. Tente outros termos ou liste as pastas (sem consulta).");
        const linhas = pontuados.map(
          ({ m }) =>
            `- [midia:${m.id}] ${m.tipo === "video" ? "🎬" : "🖼"} "${m.titulo}" · pasta: ${m.pasta}${m.duracao ? ` · ${Math.round(m.duracao)}s` : ""}${m.descricao ? ` · ${m.descricao}` : ""}${m.tags ? ` · tags: ${m.tags}` : ""}`,
        );
        return ok(`${pontuados.length} resultado(s):\n${linhas.join("\n")}`);
      }

      case "ver_biblioteca": {
        const ids = ((entrada.ids as string[]) ?? []).slice(0, 6);
        const conteudo: Exclude<ResultadoFerramenta["content"], string | undefined> = [];
        for (const id of ids) {
          const m = store.obter().midias.find((x) => x.id === id);
          if (!m) {
            conteudo.push({ type: "text", text: `${id}: não encontrado.` });
            continue;
          }
          conteudo.push({
            type: "text",
            text: `[midia:${m.id}] "${m.titulo}" (${m.tipo}${m.duracao ? `, ${Math.round(m.duracao)}s` : ""}, pasta ${m.pasta ?? "-"})${m.descricao ? `: ${m.descricao}` : ""}`,
          });
          const chaves = m.quadros ? Array.from({ length: m.quadros }, (_, i) => `${m.id}_q${i}`) : m.tipo === "imagem" ? [m.id] : [];
          for (const chave of chaves) {
            const blob = await store.lerBlob(chave);
            if (!blob) continue;
            const pequena = await reduzirImagem(blob, 480, 0.72);
            conteudo.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await blobParaBase64(pequena) } });
          }
        }
        return ok(conteudo);
      }

      case "ver_publicacao_automatica":
        return ok(await resumoPublicacaoParaGerente(store));

      case "salvar_guia_da_marca": {
        const guia = String(entrada.guia ?? "").trim().slice(0, 8000);
        if (!guia) return erro("O guia veio vazio.");
        store.editarMarca(store.marca.id, { guia });
        return ok("Guia da marca salvo no perfil. Ele passa a valer em todas as próximas criações.");
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
          .midias.filter((m) => !m.naBiblioteca)
          .slice(0, 40)
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
  const conteudo = await montarMensagem(store, `[Agora: ${hoje}]\n${texto}`, anexos);
  const pendentes = resultadosInterrompidos(store.obter().chatGerente);
  adicionarMensagem(store, {
    role: "user",
    content: pendentes.length
      ? [...pendentes, ...(typeof conteudo === "string" ? [{ type: "text" as const, text: conteudo }] : conteudo)]
      : conteudo,
  });
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
        uso: "Gerente",
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
      resultados.push(await executar(store, chamada, interacoes, aoMudarEtapa));
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
    case "ver_publicacao_automatica":
      return "Conferindo a publicação automática do plano...";
    case "salvar_guia_da_marca":
      return "Salvando o guia da marca...";
    case "buscar_biblioteca":
      return `Procurando na biblioteca${e.consulta ? `: "${e.consulta}"` : ""}...`;
    case "ver_biblioteca":
      return "Olhando os vídeos da biblioteca...";
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

/**
 * Se a página foi recarregada no meio de uma tarefa, a última resposta do Claude pode ter
 * pedidos de ferramenta sem resultado (o Claude recusa a conversa assim). Gera resultados
 * de "interrompido" para esses pedidos, sem apagar nada do histórico.
 */
function resultadosInterrompidos(chat: MensagemClaude[]): Anthropic.Beta.BetaToolResultBlockParam[] {
  const conversa = chat.filter((m) => m.role !== "system");
  const ultima = conversa.at(-1);
  if (!ultima || ultima.role !== "assistant" || typeof ultima.content === "string") return [];
  return ultima.content
    .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
    .map((b) => ({
      type: "tool_result" as const,
      tool_use_id: b.id,
      is_error: true,
      content:
        "Interrompido: a página foi recarregada antes desta ação terminar, então não sei se ela foi executada. Use listar_midias para conferir o que existe (vídeos podem estar em produção) antes de repetir.",
    }));
}
