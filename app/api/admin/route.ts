import { ErroHttp, contexto, responderErro, sql } from "@/lib/servidor/contexto";

export const runtime = "nodejs";

async function exigirAdmin(req: Request) {
  const ctx = await contexto(req);
  if (!ctx.admin) throw new ErroHttp(403, "Somente administradores.");
  return ctx;
}

// Lista as contas com plano, saldo e uso do mês.
export async function GET(req: Request) {
  try {
    await exigirAdmin(req);
    const contas = await sql()`select c.id, c.nome, c.email_cobranca, c.plano_id, c.status, c.saldo, c.preco_custom,
      c.creditos_mensais_custom, c.renova_em, c.criado_em,
      (select coalesce(sum(-creditos), 0) from movimentos m where m.conta_id = c.id and m.tipo = 'uso' and m.criado_em >= date_trunc('month', now())) as uso_mes,
      (select coalesce(sum(custo_usd), 0) from movimentos m where m.conta_id = c.id and m.tipo = 'uso' and m.criado_em >= date_trunc('month', now())) as custo_usd_mes,
      (select string_agg(u.email, ', ') from membros mb join auth.users u on u.id = mb.user_id where mb.conta_id = c.id) as emails
      from contas c order by c.criado_em desc limit 500`;
    const planos = await sql()`select id, nome from planos order by ordem`;
    return Response.json({ contas, planos });
  } catch (e) {
    return responderErro(e);
  }
}

// Ações do administrador: mudar plano (inclusive Empresa com valores próprios) e ajustar créditos.
export async function POST(req: Request) {
  try {
    const admin = await exigirAdmin(req);
    const c = (await req.json()) as {
      acao: "plano" | "creditos";
      conta: string;
      plano?: string;
      status?: string;
      creditosMensais?: number | null;
      preco?: number | null;
      recursos?: Record<string, unknown> | null;
      creditos?: number;
      motivo?: string;
    };
    const db = sql();
    if (c.acao === "plano") {
      await db`update contas set plano_id = ${c.plano ?? "teste"}, status = ${c.status ?? "ativo"},
        creditos_mensais_custom = ${c.creditosMensais ?? null}, preco_custom = ${c.preco ?? null},
        recursos_custom = ${c.recursos ? db.json(c.recursos as never) : null}
        where id = ${c.conta}::uuid`;
    } else if (c.acao === "creditos" && c.creditos) {
      if (c.creditos > 0) {
        await db`select creditar(${c.conta}::uuid, ${c.creditos}, 'ajuste', ${c.motivo ?? "Ajuste do administrador"}, null, ${admin.userId}::uuid)`;
      } else {
        await db`select debitar(${c.conta}::uuid, ${admin.userId}::uuid, ${-c.creditos}, ${c.motivo ?? "Ajuste do administrador"}, null, null, true)`;
      }
    }
    return Response.json({ ok: true });
  } catch (e) {
    return responderErro(e);
  }
}
