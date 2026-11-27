import { ErroHttp, contexto, responderErro, sql } from "@/lib/servidor/contexto";

export const runtime = "nodejs";

async function exigirAdmin(req: Request) {
  const ctx = await contexto(req);
  if (!ctx.admin) throw new ErroHttp(403, "Somente administradores.");
}

export async function GET(req: Request) {
  try {
    await exigirAdmin(req);
    return Response.json({ depoimentos: await sql()`select * from depoimentos order by ordem, criado_em` });
  } catch (e) {
    return responderErro(e);
  }
}

type Corpo =
  | { acao: "salvar"; id?: string; nome: string; cargo?: string; texto: string; nota?: number; publicado?: boolean; ordem?: number }
  | { acao: "apagar"; id: string };

export async function POST(req: Request) {
  try {
    await exigirAdmin(req);
    const c = (await req.json()) as Corpo;
    const db = sql();
    if (c.acao === "apagar") {
      await db`delete from depoimentos where id = ${c.id}::uuid`;
      return Response.json({ ok: true });
    }
    const nome = String(c.nome ?? "").trim().slice(0, 80), texto = String(c.texto ?? "").trim().slice(0, 600);
    if (!nome || !texto) throw new ErroHttp(400, "Preencha o nome e o depoimento.");
    const cargo = String(c.cargo ?? "").trim().slice(0, 80) || null;
    const nota = Math.min(5, Math.max(1, Math.round(Number(c.nota) || 5)));
    const ordem = Math.round(Number(c.ordem) || 0);
    if (c.id) {
      await db`update depoimentos set nome = ${nome}, cargo = ${cargo}, texto = ${texto}, nota = ${nota}, publicado = ${!!c.publicado}, ordem = ${ordem}
        where id = ${c.id}::uuid`;
    } else {
      await db`insert into depoimentos (nome, cargo, texto, nota, publicado, ordem) values (${nome}, ${cargo}, ${texto}, ${nota}, ${!!c.publicado}, ${ordem})`;
    }
    return Response.json({ ok: true });
  } catch (e) {
    return responderErro(e);
  }
}
