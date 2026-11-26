"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import Icone from "./Icone";
import { lerManualPdf } from "./ManualMarca";
import { useUpload } from "./SeletorMidias";

type Valor = string | string[];
type Respostas = Record<string, Valor>;
type Campo =
  | { id: string; tipo: "texto" | "area"; rotulo: string; ex?: string; obrigatorio?: boolean }
  | { id: string; tipo: "chips"; rotulo: string; opcoes: string[]; max?: number; unico?: boolean }
  | { id: string; tipo: "cores"; rotulo: string }
  | { id: string; tipo: "logo"; rotulo: string };
type Etapa = { titulo: string; sub: string; secao: string; campos: Campo[] };

const ETAPAS: Etapa[] = [
  {
    titulo: "Sua empresa",
    sub: "O básico para o gerente saber de quem está falando.",
    secao: "Empresa",
    campos: [
      { id: "nome", tipo: "texto", rotulo: "Nome da empresa", ex: "Café Aconchego", obrigatorio: true },
      { id: "arroba", tipo: "texto", rotulo: "@ do Instagram", ex: "cafeaconchego" },
      { id: "faz", tipo: "area", rotulo: "O que a empresa faz, em uma ou duas frases", ex: "Cafeteria de bairro com cafés especiais e bolos caseiros.", obrigatorio: true },
      { id: "onde", tipo: "texto", rotulo: "Cidade ou região que atende (ou se é online)", ex: "Curitiba, bairro Batel, com delivery na região central" },
      { id: "contato", tipo: "texto", rotulo: "Contatos que podem aparecer nos posts", ex: "WhatsApp (41) 9 0000-0000 · seg a sáb, 7h às 19h" },
    ],
  },
  {
    titulo: "Seu público",
    sub: "Para quem o conteúdo é feito. Quanto mais específico, melhor.",
    secao: "Público",
    campos: [
      { id: "idade", tipo: "chips", rotulo: "Faixa de idade", opcoes: ["Até 17", "18 a 24", "25 a 34", "35 a 44", "45 a 54", "55+"] },
      { id: "publico", tipo: "area", rotulo: "Quem é o cliente ideal", ex: "Quem trabalha perto, gosta de café bom e busca uma pausa tranquila." },
      { id: "dores", tipo: "area", rotulo: "O que ele quer resolver ou sentir", ex: "Um lugar calmo para uma pausa ou reunião rápida." },
      { id: "duvidas", tipo: "area", rotulo: "Dúvidas que ele mais pergunta", ex: "\"Tem opção sem lactose?\", \"Dá para trabalhar aí?\"" },
    ],
  },
  {
    titulo: "Tom de voz",
    sub: "Como a marca fala. É o que faz o conteúdo soar como você.",
    secao: "Tom de voz",
    campos: [
      { id: "tom", tipo: "chips", rotulo: "Escolha até 3 palavras", max: 3, opcoes: ["Acolhedor", "Divertido", "Profissional", "Inspirador", "Direto", "Sofisticado", "Jovem", "Técnico", "Próximo", "Ousado"] },
      { id: "tratamento", tipo: "chips", rotulo: "Como fala com o cliente", unico: true, opcoes: ["Você (informal)", "Tu", "Formal (o senhor / a senhora)"] },
      { id: "emojis", tipo: "chips", rotulo: "Emojis", unico: true, opcoes: ["Bastante", "Poucos", "Nenhum"] },
      { id: "expressoes", tipo: "texto", rotulo: "Expressões que a marca costuma usar", ex: "\"Bora de cafezinho?\", \"pausa merecida\"" },
      { id: "proibidas", tipo: "texto", rotulo: "Palavras ou assuntos que NUNCA devem aparecer", ex: "Palavrão, política, \"barato\"" },
    ],
  },
  {
    titulo: "Identidade visual",
    sub: "Para as artes e vídeos saírem no padrão da marca.",
    secao: "Identidade visual",
    campos: [
      { id: "cores", tipo: "cores", rotulo: "Cores da marca (até 4)" },
      { id: "logo", tipo: "logo", rotulo: "Logo" },
      { id: "fontes", tipo: "texto", rotulo: "Fontes (se souber)", ex: "Títulos: Playfair Display · Textos: Montserrat" },
      { id: "estilo", tipo: "chips", rotulo: "Estilo das fotos e artes", opcoes: ["Claras", "Escuras", "Minimalistas", "Coloridas", "Luz natural", "Estúdio", "Elegantes", "Divertidas"] },
      { id: "evitar", tipo: "texto", rotulo: "O que não combina com a marca", ex: "Fundos neon, fotos de banco de imagem, muito texto na arte" },
    ],
  },
  {
    titulo: "Produtos e diferenciais",
    sub: "O que você vende e por que escolher você.",
    secao: "Produtos e diferenciais",
    campos: [
      { id: "produtos", tipo: "area", rotulo: "Principais produtos ou serviços (com preço, se quiser)", ex: "Cappuccino R$ 14 · Fatia de bolo R$ 12 · Combo café + pão de queijo R$ 18" },
      { id: "diferenciais", tipo: "area", rotulo: "Diferenciais: o que só você tem ou faz melhor", ex: "Grãos de pequenos produtores, bolo feito no dia, wi-fi e tomadas." },
      { id: "promocoes", tipo: "texto", rotulo: "Promoções ou ações que se repetem", ex: "Happy hour do café às quintas, das 15h às 17h" },
    ],
  },
  {
    titulo: "Conteúdo",
    sub: "O que publicar, com que frequência e para quê.",
    secao: "Conteúdo e formatos",
    campos: [
      { id: "objetivo", tipo: "chips", rotulo: "Objetivo principal agora", unico: true, opcoes: ["Vender mais", "Engajar a comunidade", "Ganhar seguidores", "Lançar produto", "Fortalecer a marca"] },
      { id: "formatos", tipo: "chips", rotulo: "Formatos que quer usar", opcoes: ["Reels", "Carrossel", "Posts", "Stories"] },
      { id: "frequencia", tipo: "chips", rotulo: "Frequência no feed", unico: true, opcoes: ["2x por semana", "3x por semana", "4 a 5x por semana", "Todo dia"] },
      { id: "temas", tipo: "texto", rotulo: "Temas fixos", ex: "Bastidores, produtos, dicas, clientes" },
      { id: "datas", tipo: "texto", rotulo: "Datas importantes do ano", ex: "Aniversário da loja (março), Dia do Café, Natal" },
      { id: "cta", tipo: "texto", rotulo: "Chamada para ação e hashtags", ex: "\"Peça pelo link da bio\" · #cafeaconchego" },
      { id: "referencias", tipo: "texto", rotulo: "Perfis que você admira (referência)", ex: "@exemplo1 pela estética, @exemplo2 pelo humor" },
    ],
  },
  {
    titulo: "Vídeos e regras",
    sub: "Para os reels e para o que nunca pode acontecer.",
    secao: "Estilo de vídeo",
    campos: [
      { id: "duracao", tipo: "chips", rotulo: "Duração ideal dos reels", unico: true, opcoes: ["Até 15 s", "15 a 30 s", "30 a 60 s", "Mais de 1 min"] },
      { id: "ritmo", tipo: "chips", rotulo: "Ritmo dos cortes", unico: true, opcoes: ["Rápido", "Médio", "Calmo"] },
      { id: "legendas", tipo: "chips", rotulo: "Legenda escrita na tela", unico: true, opcoes: ["Sempre", "Às vezes", "Nunca"] },
      { id: "musica", tipo: "texto", rotulo: "Música e som", ex: "Lo-fi tranquilo; às vezes a dona narrando" },
      { id: "aparece", tipo: "texto", rotulo: "Quem aparece nos vídeos (e o que não pode aparecer)", ex: "A dona e o barista; não mostrar a cozinha" },
      { id: "regras", tipo: "area", rotulo: "O que nunca pode ser publicado ou prometido", ex: "Preço sem consultar, promoções não combinadas, foto de cliente sem autorização" },
    ],
  },
];

function vazio(v: Valor | undefined) {
  return !v || (Array.isArray(v) ? v.length === 0 : !v.trim());
}

const NOME_NO_GUIA: Record<string, string> = { tom: "Jeito de falar", emojis: "Uso de emojis" };
/** Rótulo curto para o guia (sem as instruções entre parênteses). */
function nomeNoGuia(id: string, rotulo: string) {
  return NOME_NO_GUIA[id] ?? rotulo.replace(/\s*\([^)]*\)\s*$/, "");
}

/** Monta o guia da marca (markdown) a partir das respostas. O que ficou em branco vai para "A definir". */
export function montarGuia(r: Respostas): string {
  const faltando: string[] = [];
  const partes = ETAPAS.map((e) => {
    const linhas = e.campos
      .filter((c) => c.tipo !== "logo")
      .map((c) => {
        const v = r[c.id];
        if (vazio(v)) {
          faltando.push(nomeNoGuia(c.id, c.rotulo));
          return null;
        }
        return `- ${nomeNoGuia(c.id, c.rotulo)}: ${Array.isArray(v) ? v.join(", ") : v}`;
      })
      .filter(Boolean);
    return `## ${e.secao}\n${linhas.length ? linhas.join("\n") : "- a definir"}`;
  });
  if (!vazio(r.logo)) partes[3] += `\n- Logo: enviado na Biblioteca (pasta "Identidade visual")`;
  return [...partes, `## A definir\n${faltando.length ? faltando.map((f) => `- ${f}`).join("\n") : "- nada"}`].join("\n\n");
}

/** Questionário em etapas para criar o perfil da marca para a IA (aparece no Início de perfis novos). */
export default function CriarPerfil({
  falarComGerente,
  aoFechar,
  podePular = true,
}: {
  falarComGerente: (t: string) => void;
  aoFechar: () => void;
  podePular?: boolean;
}) {
  const store = useStore();
  const { marca } = store;
  const chave = `rascunho-perfil:${marca.id}`;
  const [passo, setPasso] = useState(-1); // -1 = boas-vindas
  const [r, setR] = useState<Respostas>(() => {
    try {
      const salvo = localStorage.getItem(chave);
      if (salvo) return JSON.parse(salvo);
    } catch {}
    return {
      ...(marca.respostasPerfil ?? {}),
      nome: marca.respostasPerfil?.nome ?? (/^(Meu primeiro perfil|Novo perfil)$/i.test(marca.nome) ? "" : marca.nome),
      arroba: marca.respostasPerfil?.arroba ?? marca.arroba,
    };
  });
  const [lendo, setLendo] = useState(false);
  const pdf = useRef<HTMLInputElement>(null);
  const logo = useRef<HTMLInputElement>(null);
  const upload = useUpload();

  useEffect(() => {
    try {
      localStorage.setItem(chave, JSON.stringify(r));
    } catch {}
  }, [r, chave]);

  const mudar = (id: string, v: Valor) => setR((s) => ({ ...s, [id]: v }));
  const etapa = ETAPAS[passo];
  const faltaObrigatorio = etapa?.campos.some((c) => "obrigatorio" in c && c.obrigatorio && vazio(r[c.id]));

  function concluir() {
    const guia = montarGuia(r);
    const nome = String(r.nome ?? "").trim() || marca.nome;
    const resumo = [r.faz, !vazio(r.publico) && `Público: ${r.publico}`, !vazio(r.tom) && `Tom: ${(r.tom as string[]).join(", ")}`]
      .filter(Boolean)
      .join(" ");
    store.editarMarca(marca.id, {
      nome,
      arroba: String(r.arroba ?? marca.arroba).replace(/^@/, ""),
      guia,
      guiaArquivo: { nome: "Questionário do perfil", em: new Date().toISOString() },
      respostasPerfil: r,
      ...(marca.perfil.trim() ? {} : { perfil: String(resumo) }),
    });
    try {
      localStorage.removeItem(chave);
    } catch {}
    store.avisar("Perfil da marca criado! O gerente já usa essas informações em tudo o que criar.", "ok");
    aoFechar();
    falarComGerente(
      `Acabei de preencher o perfil da marca "${nome}" (o guia está salvo no perfil). Confira se faltou algo importante para criar bons conteúdos e, se estiver tudo certo, me sugira o planejamento do mês.`,
    );
  }

  async function enviarLogo(arquivos: FileList | null) {
    const novas = await upload(arquivos);
    if (!novas.length) return;
    const ids = new Set(novas.map((m) => m.id));
    store.atualizar((e) => ({
      ...e,
      midias: e.midias.map((m) => (ids.has(m.id) ? { ...m, naBiblioteca: true, pasta: "Identidade visual", descricao: "Logo da marca", titulo: "Logo" } : m)),
    }));
    mudar("logo", "enviado");
    store.avisar("Logo salvo na Biblioteca, na pasta Identidade visual.", "ok");
  }

  const barra = passo >= 0 ? ((passo + 1) / ETAPAS.length) * 100 : 0;

  return (
    <div className="cartao" style={{ maxWidth: 760, margin: "0 auto", padding: 26 }}>
      {passo === -1 ? (
        <>
          <span className="etiqueta" style={{ marginBottom: 10, display: "inline-block" }}>✨ Primeiro passo</span>
          <h2 className="titulo-pagina" style={{ margin: "0 0 6px" }}>Vamos criar o perfil da sua marca para a IA</h2>
          <p className="ajuda" style={{ fontSize: 14 }}>
            São 7 etapas rápidas (uns 5 minutos). Com isso, o gerente acerta o tom de voz, as cores e o estilo em tudo o que criar.
            Pode pular o que não souber e completar depois.
          </p>
          <div className="lista" style={{ gap: 10, marginTop: 16 }}>
            <button className="botao" style={{ padding: 14, justifyContent: "center" }} onClick={() => setPasso(0)}>
              Responder as perguntas
            </button>
            <input
              ref={pdf}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setLendo(true);
                const ok = await lerManualPdf(store, f, falarComGerente);
                setLendo(false);
                if (ok) aoFechar();
              }}
            />
            <button className="botao sec" style={{ padding: 12, justifyContent: "center" }} disabled={lendo} onClick={() => pdf.current?.click()}>
              {lendo ? "Lendo o manual..." : "Já tenho um manual da marca em PDF"}
            </button>
            {podePular && (
              <button className="link-botao" style={{ alignSelf: "center", marginTop: 4 }} onClick={aoFechar}>
                Pular por agora
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="linha" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span className="ajuda" style={{ margin: 0 }}>
              Etapa {passo + 1} de {ETAPAS.length}
            </span>
            <button className="link-botao" onClick={aoFechar}>
              Continuar depois
            </button>
          </div>
          <div className="barra" style={{ marginBottom: 18 }}>
            <div style={{ width: `${barra}%` }} />
          </div>
          <h2 className="titulo-pagina" style={{ margin: "0 0 4px" }}>{etapa.titulo}</h2>
          <p className="ajuda" style={{ marginTop: 0 }}>{etapa.sub}</p>

          {etapa.campos.map((c) => (
            <div className="campo" key={c.id}>
              <label>
                {c.rotulo}
                {"obrigatorio" in c && c.obrigatorio ? " *" : ""}
              </label>
              {c.tipo === "texto" && <input type="text" value={String(r[c.id] ?? "")} placeholder={c.ex ? `Ex.: ${c.ex}` : ""} onChange={(e) => mudar(c.id, e.target.value)} />}
              {c.tipo === "area" && <textarea rows={3} value={String(r[c.id] ?? "")} placeholder={c.ex ? `Ex.: ${c.ex}` : ""} onChange={(e) => mudar(c.id, e.target.value)} />}
              {c.tipo === "chips" && (
                <div className="filtros" style={{ margin: 0 }}>
                  {c.opcoes.map((o) => {
                    const atual = (Array.isArray(r[c.id]) ? r[c.id] : r[c.id] ? [r[c.id]] : []) as string[];
                    const sel = atual.includes(o);
                    return (
                      <button
                        key={o}
                        className={`filtro ${sel ? "ativo" : ""}`}
                        onClick={() => {
                          if (c.unico) mudar(c.id, sel ? "" : o);
                          else if (sel) mudar(c.id, atual.filter((x) => x !== o));
                          else if (!c.max || atual.length < c.max) mudar(c.id, [...atual, o]);
                        }}
                      >
                        {o}
                      </button>
                    );
                  })}
                </div>
              )}
              {c.tipo === "cores" && (
                <div className="linha" style={{ gap: 10, flexWrap: "wrap" }}>
                  {[0, 1, 2, 3].map((i) => {
                    const lista = (Array.isArray(r.cores) ? r.cores : []) as string[];
                    const v = lista[i] ?? "";
                    return (
                      <label key={i} className="linha" style={{ gap: 6, margin: 0 }}>
                        <input
                          type="color"
                          value={/^#[0-9a-f]{6}$/i.test(v) ? v : "#7c3aed"}
                          style={{ width: 38, height: 34, padding: 2, opacity: v ? 1 : 0.35 }}
                          onChange={(e) => {
                            const nova = [...lista];
                            nova[i] = e.target.value;
                            mudar("cores", nova.filter(Boolean));
                          }}
                        />
                        <input
                          type="text"
                          value={v}
                          placeholder={i === 0 ? "principal" : "#..."}
                          style={{ width: 92 }}
                          onChange={(e) => {
                            const nova = [...lista];
                            nova[i] = e.target.value.trim();
                            mudar("cores", nova.filter(Boolean));
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              )}
              {c.tipo === "logo" && (
                <div className="linha">
                  <input ref={logo} type="file" accept="image/*" hidden onChange={(e) => enviarLogo(e.target.files).then(() => (e.target.value = ""))} />
                  <button className="botao sec peq" onClick={() => logo.current?.click()}>
                    <Icone nome="mais" tamanho={14} /> {r.logo ? "Trocar logo" : "Enviar logo"}
                  </button>
                  {r.logo ? <span className="ajuda" style={{ margin: 0 }}>✅ Logo salvo na Biblioteca</span> : <span className="ajuda" style={{ margin: 0 }}>PNG ou JPG</span>}
                </div>
              )}
            </div>
          ))}

          <div className="linha" style={{ justifyContent: "space-between", marginTop: 8 }}>
            <button className="botao sec" onClick={() => setPasso(passo - 1)}>
              ← Voltar
            </button>
            {passo < ETAPAS.length - 1 ? (
              <button className="botao" disabled={faltaObrigatorio} title={faltaObrigatorio ? "Preencha os campos com *" : ""} onClick={() => setPasso(passo + 1)}>
                Próximo →
              </button>
            ) : (
              <button className="botao ok" onClick={concluir}>
                ✓ Criar perfil da marca
              </button>
            )}
          </div>
          {passo > 0 && <p className="ajuda" style={{ fontSize: 12, textAlign: "center", marginBottom: 0 }}>Pode deixar em branco o que não souber.</p>}
        </>
      )}
    </div>
  );
}

