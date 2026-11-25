import "server-only";
import { linkDeLeitura } from "./arquivos";
import { sql } from "./contexto";
import { cifrar, decifrar } from "./cripto";

// Endereços da API (podem ser trocados em testes).
const OAUTH = () => process.env.INSTAGRAM_OAUTH_URL ?? "https://www.instagram.com/oauth/authorize";
const API = () => process.env.INSTAGRAM_API_URL ?? "https://api.instagram.com";
const GRAPH = () => process.env.INSTAGRAM_GRAPH_URL ?? "https://graph.instagram.com";

export const ESCOPOS = "instagram_business_basic,instagram_business_content_publish";

export function enderecoRetorno(req: Request) {
  const base = process.env.SITE_URL?.trim().replace(/\/+$/, "") || new URL(req.url).origin;
  return `${base}/api/instagram/retorno`;
}

export function urlDeAutorizacao(req: Request, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID ?? "",
    redirect_uri: enderecoRetorno(req),
    response_type: "code",
    scope: ESCOPOS,
    state,
  });
  return `${OAUTH()}?${p}`;
}

async function jsonOuErro(r: Response) {
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error?.message ?? j.error_message ?? j.error_description ?? `Erro ${r.status}`;
    throw new Error(`Instagram: ${e}`);
  }
  return j;
}

/** Troca o código do login por um token de 60 dias e descobre qual conta foi conectada. */
export async function trocarCodigo(req: Request, code: string) {
  const form = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID ?? "",
    client_secret: process.env.INSTAGRAM_APP_SECRET ?? "",
    grant_type: "authorization_code",
    redirect_uri: enderecoRetorno(req),
    code,
  });
  const curto = await jsonOuErro(await fetch(`${API()}/oauth/access_token`, { method: "POST", body: form }));
  const tokenCurto: string = curto.access_token ?? curto.data?.[0]?.access_token;
  const longo = await jsonOuErro(
    await fetch(`${GRAPH()}/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: process.env.INSTAGRAM_APP_SECRET ?? "", access_token: tokenCurto })}`),
  );
  const eu = await jsonOuErro(await fetch(`${GRAPH()}/me?${new URLSearchParams({ fields: "user_id,username", access_token: longo.access_token })}`));
  return {
    token: longo.access_token as string,
    expiraEm: new Date(Date.now() + Number(longo.expires_in ?? 5184000) * 1000),
    igUserId: String(eu.user_id ?? eu.id),
    username: String(eu.username ?? ""),
  };
}

export async function salvarConexao(contaId: string, perfilId: string, c: Awaited<ReturnType<typeof trocarCodigo>>) {
  await sql()`insert into conexoes_instagram (perfil_id, conta_id, ig_user_id, username, token_cifrado, expira_em)
    values (${perfilId}, ${contaId}::uuid, ${c.igUserId}, ${c.username}, ${cifrar(c.token)}, ${c.expiraEm})
    on conflict (perfil_id) do update set conta_id = excluded.conta_id, ig_user_id = excluded.ig_user_id, username = excluded.username,
      token_cifrado = excluded.token_cifrado, expira_em = excluded.expira_em, atualizado_em = now()`;
}

/** Renova tokens que vencem em menos de 15 dias (o Instagram dá mais 60 dias a cada renovação). */
export async function renovarTokens() {
  const db = sql();
  const linhas = await db`select perfil_id, token_cifrado from conexoes_instagram
    where expira_em < now() + interval '15 days' and expira_em > now() and atualizado_em < now() - interval '1 day' limit 20`;
  for (const l of linhas) {
    try {
      const r = await jsonOuErro(
        await fetch(`${GRAPH()}/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: decifrar(l.token_cifrado) })}`),
      );
      await db`update conexoes_instagram set token_cifrado = ${cifrar(r.access_token)},
        expira_em = ${new Date(Date.now() + Number(r.expires_in ?? 5184000) * 1000)}, atualizado_em = now() where perfil_id = ${l.perfil_id}`;
    } catch (e) {
      console.error("Falha ao renovar token do Instagram", l.perfil_id, e);
    }
  }
}

type Midia = { caminho: string; tipo: "imagem" | "video" };
type Publicacao = {
  id: string;
  perfil_id: string;
  tipo: "post" | "carrossel" | "reels" | "story";
  legenda: string;
  midias: Midia[];
  containers: { filhos?: string[]; principal?: string } | null;
  tentativas: number;
};

async function criarContainer(igId: string, token: string, params: Record<string, string>) {
  const r = await jsonOuErro(
    await fetch(`${GRAPH()}/${igId}/media`, { method: "POST", body: new URLSearchParams({ ...params, access_token: token }) }),
  );
  return String(r.id);
}

async function statusContainer(id: string, token: string): Promise<string> {
  const r = await jsonOuErro(await fetch(`${GRAPH()}/${id}?${new URLSearchParams({ fields: "status_code,status", access_token: token })}`));
  if (r.status_code === "ERROR") throw new Error(`Instagram recusou a mídia: ${r.status ?? "erro no processamento"}`);
  return String(r.status_code ?? "FINISHED");
}

async function paramsDaMidia(m: Midia, tipo: Publicacao["tipo"], filho = false): Promise<Record<string, string>> {
  const url = await linkDeLeitura(m.caminho, 24 * 3600);
  const p: Record<string, string> = {};
  if (m.tipo === "video") {
    p.video_url = url;
    p.media_type = tipo === "story" ? "STORIES" : filho ? "VIDEO" : "REELS";
  } else {
    p.image_url = url;
    if (tipo === "story") p.media_type = "STORIES";
  }
  if (filho) p.is_carousel_item = "true";
  return p;
}

/**
 * Avança uma publicação: cria os containers (uma vez), espera os vídeos ficarem prontos
 * e publica. Devolve "publicada", "aguardando" (vídeo ainda processando) ou lança erro.
 */
export async function avancarPublicacao(p: Publicacao): Promise<"publicada" | "aguardando"> {
  const db = sql();
  const [con] = await db`select ig_user_id, token_cifrado from conexoes_instagram where perfil_id = ${p.perfil_id}`;
  if (!con) throw new Error("O Instagram deste perfil não está conectado.");
  const token = decifrar(con.token_cifrado);
  const ig = con.ig_user_id as string;
  const legenda = p.legenda.slice(0, 2200);
  let containers = p.containers ?? {};

  if (!containers.principal) {
    if (!p.midias.length) throw new Error("Sem mídia para publicar.");
    if (p.tipo === "carrossel" && p.midias.length > 1) {
      const filhos: string[] = containers.filhos ?? [];
      for (const m of p.midias.slice(filhos.length, 10)) filhos.push(await criarContainer(ig, token, await paramsDaMidia(m, p.tipo, true)));
      containers = { filhos };
      await db`update publicacoes set containers = ${db.json(containers as never)} where id = ${p.id}`;
      for (const f of filhos) if ((await statusContainer(f, token)) !== "FINISHED") return "aguardando";
      containers.principal = await criarContainer(ig, token, { media_type: "CAROUSEL", children: filhos.join(","), caption: legenda });
    } else {
      const params = await paramsDaMidia(p.midias[0], p.tipo === "carrossel" ? "post" : p.tipo);
      if (p.tipo !== "story") params.caption = legenda;
      containers.principal = await criarContainer(ig, token, params);
    }
    await db`update publicacoes set containers = ${db.json(containers as never)} where id = ${p.id}`;
  }

  if ((await statusContainer(containers.principal!, token)) !== "FINISHED") return "aguardando";

  const pub = await jsonOuErro(
    await fetch(`${GRAPH()}/${ig}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: containers.principal!, access_token: token }) }),
  );
  let permalink: string | null = null;
  try {
    const info = await jsonOuErro(await fetch(`${GRAPH()}/${pub.id}?${new URLSearchParams({ fields: "permalink", access_token: token })}`));
    permalink = info.permalink ?? null;
  } catch {
    /* o link é só um bônus */
  }
  await db`update publicacoes set status = 'publicada', ig_media_id = ${String(pub.id)}, permalink = ${permalink},
    erro = null, atualizado_em = now() where id = ${p.id}`;
  return "publicada";
}

/** Processa as publicações que já passaram da hora (chamada pelo relógio a cada poucos minutos). */
export async function processarFila(limite = 8) {
  const db = sql();
  const fila = (await db`update publicacoes set status = 'publicando', tentativas = tentativas + 1, atualizado_em = now()
    where id in (
      select id from publicacoes
      where (status = 'agendada' and quando <= now())
         or (status = 'publicando' and atualizado_em < now() - interval '2 minutes')
      order by quando limit ${limite} for update skip locked)
    returning id, perfil_id, tipo, legenda, midias, containers, tentativas`) as unknown as Publicacao[];
  const resultado: Record<string, string> = {};
  for (const p of fila) {
    try {
      resultado[p.id] = await avancarPublicacao(p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Vídeo ainda processando volta para a fila; erros definitivos param após 5 tentativas.
      const desistir = p.tentativas >= 5;
      await db`update publicacoes set status = ${desistir ? "erro" : "publicando"}, erro = ${msg}, atualizado_em = now() where id = ${p.id}`;
      resultado[p.id] = `erro: ${msg}`;
    }
  }
  return resultado;
}
