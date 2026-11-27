"use client";

import { useEffect, useState } from "react";
import { beneficios, estimativa } from "@/lib/planos";
import type { InfoNuvem } from "@/lib/sincronia";
import { brl } from "@/lib/util";
import Icone from "./Icone";
import Login from "./Login";
import Logo from "./Logo";

type Planos = {
  planos: InfoNuvem["planos"];
  cambio: number;
  precos: InfoNuvem["precos"];
  whatsapp: string;
  publicacaoAtiva?: boolean;
};

const PASSOS = [
  { n: "1", titulo: "Crie o perfil da marca", texto: "Responda 7 perguntas rápidas ou envie o manual da marca. A IA aprende o tom de voz, as cores e o estilo do seu cliente." },
  { n: "2", titulo: "Peça ao gerente", texto: "\"Monte o planejamento de dezembro\" ou \"crie 3 reels da promoção\". Ele planeja, escreve as legendas e cria as imagens e os vídeos." },
  { n: "3", titulo: "Aprove e publique", texto: "Tudo chega para você aprovar. O que você aprova vai para o calendário e pode sair sozinho no Instagram." },
];

const FUNCOES = [
  { icone: "central", titulo: "Gerente de marketing com IA", texto: "Conversa como um profissional: faz as perguntas certas, monta o planejamento do mês e entrega cada peça pronta." },
  { icone: "imagem", titulo: "Imagens com o Nano Banana", texto: "Posts, stories e carrosséis nas cores da marca, criados do zero ou a partir das fotos reais do cliente." },
  { icone: "video", titulo: "Vídeos com Veo e Seedance", texto: "Reels curtos a partir de texto, de uma foto do produto ou de um vídeo de referência." },
  { icone: "aprovar", titulo: "Aprovações sem bagunça", texto: "Aprove, peça ajuste (volta direto para o gerente) ou reprove. Nada sai sem o seu ok." },
  { icone: "calendario", titulo: "Calendário e publicação automática", texto: "Veja o mês inteiro e deixe os posts saírem sozinhos no Instagram na data marcada.", publicacao: true },
  { icone: "perfis", titulo: "Vários clientes num lugar só", texto: "Cada perfil com a própria marca, conversas, mídias, aprovações e calendário. Troque com um clique." },
  { icone: "biblioteca", titulo: "Biblioteca de referências", texto: "Fotos e vídeos reais organizados em pastas (ou importados do Google Drive) para a IA usar." },
  { icone: "carteira", titulo: "Créditos sem surpresa", texto: "Você vê quanto cada ação custa antes de gerar. Sem créditos, a geração para: nunca tem conta inesperada." },
];

const TELAS = [
  { img: "/vendas/midias.jpg", titulo: "Mídias", texto: "As fotos do cliente e tudo o que a IA criou, num lugar só." },
  { img: "/vendas/aprovacoes.jpg", titulo: "Aprovações", texto: "Legenda, hashtags, data e mídia, prontos para aprovar." },
  { img: "/vendas/calendario.jpg", titulo: "Calendário", texto: "O mês de cada cliente organizado." },
  { img: "/vendas/perfil-marca.jpg", titulo: "Perfil da marca", texto: "A IA aprende o jeito de cada cliente." },
];

const PERGUNTAS = [
  { p: "Preciso entender de inteligência artificial?", r: "Não. Você conversa em português com o gerente, como faria com uma pessoa. Ele escreve os comandos para as IAs de imagem e vídeo." },
  { p: "Como funcionam os créditos?", r: "Cada plano traz créditos por mês. Cada imagem, vídeo ou conversa usa créditos pelo custo real da IA, e você vê o valor antes de gerar vídeos. Parte do que sobra passa para o mês seguinte, conforme o plano. Se precisar de mais, compre uma recarga, que não vence." },
  { p: "Tem teste grátis?", r: "Sim. Ao criar a conta você ganha créditos de teste para conhecer a plataforma, sem cartão." },
  { p: "A publicação no Instagram é automática?", r: "Sim, nos planos pagos (com limite mensal no Essencial e no Profissional, e sem limite no Premium). A conta do Instagram precisa ser profissional. Você também pode baixar tudo e postar como preferir.", publicacao: true },
  { p: "Posso cancelar quando quiser?", r: "Pode. O cancelamento é feito na própria plataforma e os créditos que sobraram continuam valendo até acabar." },
  { p: "Como pago?", r: "Pix, boleto ou cartão, pelo Asaas. Os créditos entram assim que o pagamento é confirmado." },
  { p: "A IA erra?", r: "Às vezes, por isso tudo passa pela sua aprovação. Textos dentro das imagens e detalhes de logos podem sair diferentes; vale revisar antes de aprovar." },
];

/** Página de vendas: aparece para quem ainda não entrou na plataforma. */
export default function PaginaVendas() {
  const [login, setLogin] = useState<null | "entrar" | "criar">(null);
  const [dados, setDados] = useState<Planos | null>(null);
  const [aberta, setAberta] = useState<number | null>(0);

  useEffect(() => {
    fetch("/api/planos")
      .then((r) => r.json())
      .then((d: Planos) => setDados(d.planos?.length ? d : null))
      .catch(() => {});
  }, []);

  if (login) return <Login modoInicial={login} aoVoltar={() => setLogin(null)} />;

  // Enquanto a publicação automática não estiver ligada na plataforma, a página diz "em breve".
  const emBreve = !dados?.publicacaoAtiva;
  const funcoes = FUNCOES.map((f) => (f.publicacao && emBreve ? { ...f, titulo: `${f.titulo} (em breve)`, texto: "Veja o mês inteiro organizado. Em breve, os posts vão poder sair sozinhos no Instagram na data marcada." } : f));
  const perguntas = PERGUNTAS.map((q) =>
    q.publicacao && emBreve ? { ...q, r: "Está chegando. Hoje você aprova, baixa as peças e posta; em breve os planos pagos vão publicar sozinhos no Instagram na data marcada." } : q,
  );
  const zap = dados?.whatsapp
    ? `https://wa.me/${dados.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Olá! Quero saber mais sobre a Galhos.")}`
    : null;

  return (
    <div className="vendas">
      <header className="vendas-topo">
        <div className="vendas-largura linha" style={{ justifyContent: "space-between" }}>
          <div className="linha" style={{ gap: 10 }}>
            <Logo tamanho={32} />
            <b style={{ fontSize: 18 }}>Galhos</b>
          </div>
          <div className="linha" style={{ gap: 8 }}>
            <button className="botao sec peq" onClick={() => setLogin("entrar")}>Entrar</button>
            <button className="botao peq" onClick={() => setLogin("criar")}>Testar grátis</button>
          </div>
        </div>
      </header>

      <section className="vendas-largura vendas-heroi">
        <span className="etiqueta">✨ Para social medias e agências</span>
        <h1>
          Seu gerente de marketing com IA,
          <br />
          <span className="vendas-gradiente">do planejamento ao post publicado.</span>
        </h1>
        <p>
          A Galhos planeja o mês, cria imagens e vídeos com as melhores IAs, organiza as aprovações e publica no Instagram.
          Tudo no estilo de cada cliente, num lugar só.
        </p>
        <div className="linha" style={{ gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="botao" style={{ padding: "14px 26px", fontSize: 16 }} onClick={() => setLogin("criar")}>
            Começar grátis
          </button>
          <a className="botao sec" style={{ padding: "14px 22px", textDecoration: "none" }} href="#planos">
            Ver planos
          </a>
        </div>
        <p className="ajuda" style={{ marginTop: 10 }}>Créditos de teste grátis · sem cartão · cancele quando quiser</p>
        <img className="vendas-print vendas-print-grande" src="/vendas/central.jpg" alt="Tela da Central do gerente da Galhos" />
      </section>

      <section className="vendas-largura vendas-secao">
        <h2>Como funciona</h2>
        <div className="vendas-grade-3">
          {PASSOS.map((p) => (
            <div key={p.n} className="cartao">
              <span className="vendas-numero">{p.n}</span>
              <h3 style={{ marginTop: 10 }}>{p.titulo}</h3>
              <p className="ajuda" style={{ margin: 0 }}>{p.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="vendas-largura vendas-secao">
        <h2>Tudo o que você precisa para cuidar das redes dos seus clientes</h2>
        <div className="vendas-grade-4">
          {funcoes.map((f) => (
            <div key={f.titulo} className="cartao">
              <span className="vendas-icone"><Icone nome={f.icone} tamanho={18} /></span>
              <h3 style={{ margin: "10px 0 6px", fontSize: 15 }}>{f.titulo}</h3>
              <p className="ajuda" style={{ margin: 0 }}>{f.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="vendas-largura vendas-secao">
        <h2>Veja por dentro</h2>
        <div className="vendas-grade-2">
          {TELAS.map((t) => (
            <figure key={t.img} className="vendas-tela">
              <img className="vendas-print" src={t.img} alt={`Tela ${t.titulo} da Galhos`} loading="lazy" />
              <figcaption>
                <b>{t.titulo}</b> · <span className="ajuda">{t.texto}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {dados && (
        <section id="planos" className="vendas-largura vendas-secao">
          <h2>Planos</h2>
          <p className="ajuda" style={{ textAlign: "center", marginTop: -8 }}>1 crédito = R$ 0,10 de uso de IA. Sem fidelidade.</p>
          <div className="planos" style={{ marginTop: 18 }}>
            {dados.planos.map((p) => (
              <div key={p.id} className={`plano ${p.id === "profissional" ? "destaque" : ""}`}>
                <b style={{ fontSize: 16 }}>{p.nome}</b>
                <div className="preco">
                  {brl(p.preco)}
                  <small>/mês</small>
                </div>
                <span className="etiqueta">{p.creditos_mensais.toLocaleString("pt-BR")} créditos por mês</span>
                <span className="ajuda">{estimativa(dados, p.creditos_mensais)}</span>
                <ul>
                  {beneficios(p.recursos).map((b) => (
                    <li key={b.texto} className={b.tem ? "" : "nao"}>
                      {b.texto}
                      {b.tem && emBreve && b.texto.startsWith("Publicação automática") ? " (em breve)" : ""}
                    </li>
                  ))}
                </ul>
                <button className="botao" style={{ marginTop: "auto", width: "100%" }} onClick={() => setLogin("criar")}>
                  Começar grátis
                </button>
              </div>
            ))}
            <div className="plano">
              <b style={{ fontSize: 16 }}>Empresa</b>
              <div className="preco" style={{ fontSize: 22 }}>Sob consulta</div>
              <span className="ajuda">Para agências e empresas com muitos perfis.</span>
              <ul>
                <li>Dezenas de perfis de clientes</li>
                <li>Todas as IAs no máximo</li>
                <li>Créditos e valor combinados</li>
                <li>Publicação automática sem limite{emBreve ? " (em breve)" : ""}</li>
                <li>Atendimento dedicado</li>
              </ul>
              {zap && (
                <a className="botao sec" style={{ marginTop: "auto", width: "100%", textDecoration: "none" }} href={zap} target="_blank" rel="noreferrer">
                  Falar no WhatsApp
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="vendas-largura vendas-secao">
        <h2>Para quem é</h2>
        <div className="vendas-grade-3">
          {[
            ["Social medias", "Atenda mais clientes sem perder qualidade: o gerente faz o trabalho pesado e você aprova."],
            ["Agências", "Cada cliente com o próprio perfil de marca, calendário e aprovações, e você no controle dos custos."],
            ["Pequenos negócios", "Tenha presença profissional no Instagram sem precisar contratar uma equipe."],
          ].map(([t, x]) => (
            <div key={t} className="cartao">
              <h3 style={{ marginTop: 0 }}>{t}</h3>
              <p className="ajuda" style={{ margin: 0 }}>{x}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="vendas-largura vendas-secao" style={{ maxWidth: 820 }}>
        <h2>Perguntas frequentes</h2>
        <div className="lista" style={{ gap: 8 }}>
          {perguntas.map((q, i) => (
            <div key={q.p} className="cartao" style={{ padding: 0 }}>
              <button className="vendas-pergunta" onClick={() => setAberta(aberta === i ? null : i)} aria-expanded={aberta === i}>
                <b>{q.p}</b>
                <span>{aberta === i ? "−" : "+"}</span>
              </button>
              {aberta === i && <p className="ajuda" style={{ margin: 0, padding: "0 18px 16px" }}>{q.r}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="vendas-largura vendas-secao vendas-final">
        <h2>Comece hoje, de graça</h2>
        <p className="ajuda">Crie a conta, monte o perfil da primeira marca e peça o planejamento do mês. Leva 5 minutos.</p>
        <button className="botao" style={{ padding: "14px 26px", fontSize: 16 }} onClick={() => setLogin("criar")}>
          Criar minha conta grátis
        </button>
      </section>

      <footer className="vendas-rodape">
        <div className="vendas-largura linha" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <span className="linha" style={{ gap: 8 }}>
            <Logo tamanho={22} /> Galhos · Estúdio de conteúdo com IA
          </span>
          <span className="linha" style={{ gap: 16 }}>
            <a href="/termos">Termos de uso</a>
            <a href="/privacidade">Privacidade</a>
            {zap && <a href={zap} target="_blank" rel="noreferrer">WhatsApp</a>}
          </span>
        </div>
      </footer>
    </div>
  );
}
