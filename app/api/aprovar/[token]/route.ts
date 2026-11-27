import { linkValido } from "@/lib/servidor/aprovacao";
import { linkDeLeitura } from "@/lib/servidor/arquivos";
import { ErroHttp, responderErro, sql } from "@/lib/servidor/contexto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Midia = { id: string; tipo: "imagem" | "video"; titulo?: string; status?: string };
type Aprovacao = {
  id: string; titulo: string; tipo: string; redes: string[]; legenda: string; hashtags: string;
  dataPublicacao?: string; midias: string[]; status: string;
};

const INVALIDO = "Este link não existe mais ou já venceu. Peça um novo para quem cuida das suas redes.";

// Página pública do cliente: só as peças escolhidas no link, com links temporários das mídias.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const link = await linkValido(token);
    if (!link) throw new ErroHttp(404, INVALIDO);
    const db = sql();
    const [p] = await db`select dados from perfis where id = ${link.perfil_id} and conta_id = ${link.conta_id}::uuid and not apagado`;
    if (!p) throw new ErroHttp(404, INVALIDO);
    const dados = p.dados as { nome?: string; arroba?: string; cor?: string; aprovacoes?: Aprovacao[]; midias?: Midia[] };
    const midias = new Map((dados.midias ?? []).map((m) => [m.id, m]));
    const escolhidos = new Set(link.itens);
    const itens = await Promise.all(
      (dados.aprovacoes ?? [])
        .filter((a) => escolhidos.has(a.id))
        .map(async (a) => ({
          id: a.id,
          titulo: a.titulo,
          tipo: a.tipo,
          redes: a.redes ?? [],
          legenda: a.legenda ?? "",
          hashtags: a.hashtags ?? "",
          data: a.dataPublicacao ?? null,
          midias: (
            await Promise.all(
              (a.midias ?? []).slice(0, 10).map(async (id) => {
                const m = midias.get(id);
                if (!m || m.status === "gerando") return null;
                const url = await linkDeLeitura(`${link.conta_id}/${id.replace(/[^\w.\-]/g, "_")}`, 3 * 3600).catch(() => null);
                return url ? { tipo: m.tipo, url } : null;
              }),
            )
          ).filter(Boolean),
        })),
    );
    const decisoes = await db`select aprovacao_id, decisao, comentario, nome, em from decisoes_cliente where link_id = ${link.id}::uuid`;
    return Response.json(
      {
        marca: { nome: dados.nome ?? "", arroba: dados.arroba ?? "", cor: dados.cor ?? "#7c3aed" },
        nome: link.nome,
        expira_em: link.expira_em,
        itens,
        decisoes,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return responderErro(e);
  }
}

// O cliente aprova ou pede ajuste numa peça (pode mudar de ideia: vale a última resposta).
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const link = await linkValido(token);
    if (!link) throw new ErroHttp(404, INVALIDO);
    const c = (await req.json()) as { aprovacao: string; decisao: string; comentario?: string; nome?: string };
    if (!link.itens.includes(c.aprovacao)) throw new ErroHttp(400, "Peça inválida.");
    if (c.decisao !== "aprovado" && c.decisao !== "ajuste") throw new ErroHttp(400, "Resposta inválida.");
    const comentario = String(c.comentario ?? "").trim().slice(0, 1000) || null;
    if (c.decisao === "ajuste" && !comentario) throw new ErroHttp(400, "Conte o que precisa mudar.");
    const nome = String(c.nome ?? "").trim().slice(0, 80) || null;
    await sql()`insert into decisoes_cliente (link_id, aprovacao_id, conta_id, perfil_id, decisao, comentario, nome)
      values (${link.id}::uuid, ${c.aprovacao}, ${link.conta_id}::uuid, ${link.perfil_id}, ${c.decisao}, ${comentario}, ${nome})
      on conflict (link_id, aprovacao_id) do update set decisao = excluded.decisao, comentario = excluded.comentario,
        nome = excluded.nome, em = now()`;
    return Response.json({ ok: true });
  } catch (e) {
    return responderErro(e);
  }
}
