"use client";

import type Anthropic from "@anthropic-ai/sdk";
import { useMemo, useRef, useState } from "react";
import { adicionarNaBiblioteca, baixarDoDrive, listarDrive, type ArquivoDrive } from "@/lib/biblioteca";
import { db } from "@/lib/db";
import { chamarClaude } from "@/lib/servicos";
import { useStore, useUrlMidia } from "@/lib/store";
import type { Midia } from "@/lib/tipos";
import { blobParaBase64, reduzirImagem } from "@/lib/util";
import Icone from "../Icone";
import { CartaoMidia } from "../MidiaView";

function tamanho(bytes: number) {
  if (!bytes) return "";
  return bytes > 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

export default function Biblioteca({ mandarParaCentral }: { mandarParaCentral: (ids: string[]) => void }) {
  const store = useStore();
  const itens = store.estado.midias.filter((m) => m.naBiblioteca);
  const [pasta, setPasta] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  // O andamento fica na plataforma (aparece no topo mesmo se você mudar de aba).
  const progresso = store.tarefa;
  const setProgresso = store.definirTarefa;
  const [aberto, setAberto] = useState<Midia | null>(null);
  const [drive, setDrive] = useState(false);
  const [selecao, setSelecao] = useState<string[]>([]);
  const inputArquivos = useRef<HTMLInputElement>(null);
  const inputPasta = useRef<HTMLInputElement>(null);

  const pastas = useMemo(() => {
    const mapa = new Map<string, number>();
    itens.forEach((m) => mapa.set(m.pasta ?? "Geral", (mapa.get(m.pasta ?? "Geral") ?? 0) + 1));
    return [...mapa].sort((a, b) => a[0].localeCompare(b[0]));
  }, [itens]);

  const termo = busca.trim().toLowerCase();
  const visiveis = itens
    .filter((m) => !pasta || m.pasta === pasta)
    .filter((m) => !termo || `${m.titulo} ${m.pasta} ${m.descricao ?? ""} ${m.tags ?? ""}`.toLowerCase().includes(termo));
  const semDescricao = itens.filter((m) => !m.descricao && (m.quadros || m.tipo === "imagem"));

  async function enviar(arquivos: FileList | null, comPastas: boolean) {
    if (!arquivos?.length) return;
    const lista = Array.from(arquivos).map((f) => {
      const caminho = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
      const p = comPastas && caminho ? caminho.split("/").slice(0, -1).join("/") : (pasta ?? "Geral");
      return { blob: f as Blob, nome: f.name, pasta: p };
    });
    setProgresso(`Preparando 0 de ${lista.length}...`);
    store.definirOcupado(true);
    try {
      await adicionarNaBiblioteca(store, lista, (f, t) => setProgresso(`Preparando ${f} de ${t} (extraindo quadros dos vídeos)...`));
      store.avisar(`${lista.length} arquivo(s) adicionados à biblioteca.`, "ok");
    } finally {
      setProgresso(undefined);
      store.definirOcupado(false);
    }
  }

  async function descreverComIA() {
    const lote = semDescricao.slice(0, 40);
    if (!lote.length) return;
    if (!window.confirm(`Descrever ${lote.length} item(ns) com o Claude Haiku (bem barato, centavos)? Isso ajuda o gerente a achar os vídeos certos.`)) return;
    let feitos = 0;
    store.definirOcupado(true);
    for (const m of lote) {
      setProgresso(`Descrevendo ${++feitos} de ${lote.length}: ${m.titulo}...`);
      try {
        const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [];
        const chaves = m.quadros ? Array.from({ length: m.quadros }, (_, i) => `${m.id}_q${i}`) : [m.id];
        for (const ch of chaves) {
          const b = await store.lerBlob(ch);
          if (!b) continue;
          const p = await reduzirImagem(b, 480, 0.7);
          conteudo.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await blobParaBase64(p) } });
        }
        conteudo.push({
          type: "text",
          text: `Arquivo "${m.titulo}" da pasta "${m.pasta}"${m.duracao ? `, vídeo de ${Math.round(m.duracao)}s (as imagens são quadros do início ao fim)` : ""}. Responda só com JSON: {"descricao": "o que acontece, em 1 ou 2 frases objetivas em português", "tags": "5 a 8 palavras-chave separadas por vírgula"}`,
        });
        const r = await chamarClaude(store, { messages: [{ role: "user", content: conteudo }], effort: "low", modelo: "claude-haiku-5-5" });
        const texto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
        const json = JSON.parse(texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1));
        store.atualizarMidia(m.id, { descricao: String(json.descricao ?? ""), tags: String(json.tags ?? "") });
      } catch (e) {
        console.warn("Falha ao descrever", m.titulo, e);
      }
    }
    setProgresso(undefined);
    store.definirOcupado(false);
    store.avisar("Descrições prontas.", "ok");
  }

  return (
    <div className="conteudo">
      <div className="cartao" style={{ marginBottom: 18 }}>
        <h3>
          <Icone nome="pasta" /> Biblioteca de referências
        </h3>
        <p className="ajuda" style={{ marginTop: -4 }}>
          Guarde aqui os seus vídeos e fotos prontos (ex.: consertos de celular). O gerente procura nesta biblioteca, olha os
          vídeos e usa o melhor como referência para o Seedance animar. Envie uma pasta inteira de uma vez ou importe do
          Google Drive.
        </p>
        <div className="linha">
          <input ref={inputArquivos} type="file" accept="video/*,image/*" multiple hidden onChange={(e) => { enviar(e.target.files, false); e.target.value = ""; }} />
          <input
            ref={inputPasta}
            type="file"
            multiple
            hidden
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            onChange={(e) => {
              enviar(e.target.files, true);
              e.target.value = "";
            }}
          />
          <button className="botao" onClick={() => inputArquivos.current?.click()} disabled={!!progresso}>
            <Icone nome="mais" /> Enviar arquivos{pasta ? ` para "${pasta}"` : ""}
          </button>
          <button className="botao sec" onClick={() => inputPasta.current?.click()} disabled={!!progresso}>
            <Icone nome="pasta" tamanho={15} /> Enviar uma pasta inteira
          </button>
          <button className="botao sec" onClick={() => setDrive(true)} disabled={!!progresso}>
            <Icone nome="link" tamanho={15} /> Importar do Google Drive
          </button>
          {semDescricao.length > 0 && (
            <button className="botao sec" onClick={descreverComIA} disabled={!!progresso} title="Ajuda o gerente a achar os vídeos certos">
              <Icone nome="central" tamanho={15} /> Descrever com IA ({semDescricao.length})
            </button>
          )}
        </div>
        {progresso && (
          <div className="etapa" style={{ marginTop: 12 }}>
            <div className="girando" /> {progresso}
          </div>
        )}
      </div>

      <div className="linha" style={{ alignItems: "flex-start", gap: 18 }}>
        <div className="cartao" style={{ width: 230, padding: 10, flexShrink: 0 }}>
          <button className={`menu-item ${pasta === null ? "ativo" : ""}`} onClick={() => setPasta(null)}>
            <Icone nome="pasta" tamanho={16} /> <span style={{ flex: 1 }}>Todas</span> <span className="ajuda">{itens.length}</span>
          </button>
          {pastas.map(([p, n]) => (
            <button key={p} className={`menu-item ${pasta === p ? "ativo" : ""}`} onClick={() => setPasta(p)} title={p}>
              <Icone nome="pasta" tamanho={16} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
              <span className="ajuda">{n}</span>
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="linha" style={{ marginBottom: 12 }}>
            <div style={{ position: "relative", flex: 1, maxWidth: 380 }}>
              <span style={{ position: "absolute", left: 11, top: 10, color: "var(--texto-3)" }}>
                <Icone nome="busca" tamanho={16} />
              </span>
              <input type="search" placeholder="Buscar por nome, descrição ou tag…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ paddingLeft: 34 }} />
            </div>
            {selecao.length > 0 && (
              <>
                <button className="botao" onClick={() => mandarParaCentral(selecao)}>
                  Mandar {selecao.length} para o gerente
                </button>
                <button className="botao sec" onClick={() => setSelecao([])}>
                  Limpar seleção
                </button>
              </>
            )}
          </div>
          {visiveis.length === 0 ? (
            <p className="vazio">{itens.length ? "Nada encontrado." : "A biblioteca está vazia. Envie arquivos, uma pasta ou importe do Google Drive."}</p>
          ) : (
            <div className="grade-midias">
              {visiveis.map((m) => (
                <div key={m.id}>
                  <CartaoMidia
                    midia={m}
                    selecionada={selecao.includes(m.id)}
                    aoClicar={() => setAberto(m)}
                    acoes={
                      <button
                        className="botao sec peq"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelecao((s) => (s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id]));
                        }}
                      >
                        {selecao.includes(m.id) ? "✓ Selecionado" : "Selecionar"}
                      </button>
                    }
                  />
                  {m.descricao && (
                    <p className="ajuda" style={{ fontSize: 12, margin: "4px 2px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {m.descricao}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {aberto && <ModalItem item={aberto} pastas={pastas.map((p) => p[0])} aoFechar={() => setAberto(null)} mandar={() => mandarParaCentral([aberto.id])} />}
      {drive && <ModalDrive aoFechar={() => setDrive(false)} setProgresso={setProgresso} />}
    </div>
  );
}

function ModalItem({ item, pastas, aoFechar, mandar }: { item: Midia; pastas: string[]; aoFechar: () => void; mandar: () => void }) {
  const store = useStore();
  const url = useUrlMidia(item.id);
  const [dados, setDados] = useState({ titulo: item.titulo, pasta: item.pasta ?? "Geral", descricao: item.descricao ?? "", tags: item.tags ?? "" });
  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="modal" style={{ width: "min(760px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ borderRadius: 12, overflow: "hidden", background: "#000", marginBottom: 14, maxHeight: "50vh", display: "flex", justifyContent: "center" }}>
          {url &&
            (item.tipo === "video" ? (
              <video src={url} controls style={{ maxHeight: "50vh", maxWidth: "100%" }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={item.titulo} style={{ maxHeight: "50vh", maxWidth: "100%" }} />
            ))}
        </div>
        <div className="grade-2">
          <div className="campo">
            <label>Nome</label>
            <input type="text" value={dados.titulo} onChange={(e) => setDados({ ...dados, titulo: e.target.value })} />
          </div>
          <div className="campo">
            <label>Pasta</label>
            <input type="text" list="pastas-bib" value={dados.pasta} onChange={(e) => setDados({ ...dados, pasta: e.target.value })} />
            <datalist id="pastas-bib">
              {pastas.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="campo">
          <label>Descrição (o gerente usa para achar o vídeo certo)</label>
          <textarea rows={3} value={dados.descricao} onChange={(e) => setDados({ ...dados, descricao: e.target.value })} placeholder="Ex.: troca de tela de iPhone 13, close nas mãos do técnico, bancada preta" />
        </div>
        <div className="campo">
          <label>Tags</label>
          <input type="text" value={dados.tags} onChange={(e) => setDados({ ...dados, tags: e.target.value })} placeholder="iphone, tela, conserto, bancada" />
        </div>
        <p className="ajuda">
          {item.tipo === "video" ? `Vídeo${item.duracao ? ` de ${Math.round(item.duracao)}s` : ""}. ` : "Foto. "}
          {item.duracao && item.duracao > 30 ? "Vídeos longos são recortados (até 15 s) quando usados como referência." : ""}
        </p>
        <div className="linha" style={{ justifyContent: "space-between" }}>
          <button
            className="botao perigo"
            onClick={async () => {
              if (!window.confirm("Excluir da biblioteca?")) return;
              await db.apagar(`blob:${item.id}`);
              for (let i = 0; i < (item.quadros ?? 0); i++) await db.apagar(`blob:${item.id}_q${i}`);
              store.atualizar((e) => ({ ...e, midias: e.midias.filter((m) => m.id !== item.id) }));
              aoFechar();
            }}
          >
            <Icone nome="lixo" tamanho={15} /> Excluir
          </button>
          <div className="linha">
            <button className="botao sec" onClick={() => { mandar(); aoFechar(); }}>
              Mandar para o gerente
            </button>
            <button
              className="botao"
              onClick={() => {
                store.atualizarMidia(item.id, { titulo: dados.titulo || item.titulo, pasta: dados.pasta || "Geral", descricao: dados.descricao, tags: dados.tags });
                aoFechar();
              }}
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalDrive({ aoFechar, setProgresso }: { aoFechar: () => void; setProgresso: (s?: string) => void }) {
  const store = useStore();
  const [link, setLink] = useState("");
  const [chave, setChave] = useState(store.conta.config.chaveDrive);
  const [arquivos, setArquivos] = useState<ArquivoDrive[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string>();
  const [carregando, setCarregando] = useState(false);
  const jaImportados = new Set(store.estado.midias.map((m) => m.driveId).filter(Boolean));

  async function listar() {
    setErro(undefined);
    setCarregando(true);
    try {
      if (chave !== store.conta.config.chaveDrive) store.atualizar((e) => ({ ...e, config: { ...e.config, chaveDrive: chave.trim() } }));
      const lista = await listarDrive(link, chave.trim());
      setArquivos(lista);
      setMarcados(new Set(lista.filter((a) => !jaImportados.has(a.id)).map((a) => a.id)));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }

  async function importar() {
    const escolhidos = (arquivos ?? []).filter((a) => marcados.has(a.id));
    aoFechar();
    let feitos = 0;
    let falhas = 0;
    store.definirOcupado(true);
    for (const a of escolhidos) {
      setProgresso(`Importando do Drive ${++feitos} de ${escolhidos.length}: ${a.nome} ${tamanho(a.tamanho)}...`);
      try {
        const blob = await baixarDoDrive(a, chave.trim());
        await adicionarNaBiblioteca(store, [{ blob, nome: a.nome, pasta: a.pasta, driveId: a.id }]);
      } catch (e) {
        falhas++;
        console.warn(e);
      }
    }
    setProgresso(undefined);
    store.definirOcupado(false);
    store.avisar(`Importação concluída: ${escolhidos.length - falhas} arquivo(s)${falhas ? `, ${falhas} com erro` : ""}.`, falhas ? "erro" : "ok");
  }

  const total = (arquivos ?? []).filter((a) => marcados.has(a.id)).reduce((s, a) => s + a.tamanho, 0);

  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Importar do Google Drive</h3>
        <p className="ajuda" style={{ marginTop: -4 }}>
          A pasta precisa estar compartilhada como <b>“Qualquer pessoa com o link”</b>. Os arquivos são copiados para a
          biblioteca (subpastas viram pastas aqui).
        </p>
        <div className="campo">
          <label>Link da pasta (ou de um arquivo) do Google Drive</label>
          <input type="text" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." />
        </div>
        <div className="campo">
          <label>Chave de API do Google (só para ler o Drive, não precisa de faturamento)</label>
          <input type="password" value={chave} onChange={(e) => setChave(e.target.value)} placeholder="AIza..." />
          <p className="ajuda" style={{ fontSize: 12 }}>
            console.cloud.google.com → crie um projeto → APIs e serviços → ative a <b>Google Drive API</b> → Credenciais →
            Criar credenciais → Chave de API. Fica salva nesta conta.
          </p>
        </div>
        {erro && <div className="erro-msg">{erro}</div>}
        {arquivos && (
          <div style={{ maxHeight: "34vh", overflowY: "auto", border: "1px solid var(--borda)", borderRadius: 10, padding: 6, marginBottom: 12 }}>
            {arquivos.length === 0 && <p className="vazio" style={{ padding: 16 }}>Nenhum vídeo ou imagem nessa pasta.</p>}
            {arquivos.map((a) => (
              <label key={a.id} className="menu-item" style={{ margin: 0, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={marcados.has(a.id)}
                  onChange={(e) =>
                    setMarcados((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(a.id);
                      else n.delete(a.id);
                      return n;
                    })
                  }
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  {a.mime.startsWith("video") ? "🎬" : "🖼"} {a.nome}
                  <span className="sub">
                    {a.pasta} · {tamanho(a.tamanho)}
                    {a.duracao ? ` · ${Math.round(a.duracao)}s` : ""}
                    {jaImportados.has(a.id) ? " · já importado" : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
        <div className="linha" style={{ justifyContent: "flex-end" }}>
          <button className="botao sec" onClick={aoFechar}>
            Cancelar
          </button>
          {!arquivos ? (
            <button className="botao" onClick={listar} disabled={!link.trim() || !chave.trim() || carregando}>
              {carregando ? "Lendo a pasta..." : "Ler a pasta"}
            </button>
          ) : (
            <button className="botao" onClick={importar} disabled={!marcados.size}>
              Importar {marcados.size} ({tamanho(total)})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
