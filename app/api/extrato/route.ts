import { contexto, responderErro, sql } from "@/lib/servidor/contexto";

export const runtime = "nodejs";

// Extrato da carteira de créditos (últimos 200 movimentos) e o gasto do mês por tipo.
export async function GET(req: Request) {
  try {
    const ctx = await contexto(req);
    const db = sql();
    const movimentos = await db`select id, tipo, creditos, saldo_apos, descricao, criado_em from movimentos
      where conta_id = ${ctx.conta.id}::uuid order by id desc limit 200`;
    const [mes] = await db`select coalesce(sum(-creditos) filter (where tipo = 'uso'), 0) as usados,
      coalesce(sum(creditos) filter (where tipo = 'estorno'), 0) as estornados
      from movimentos where conta_id = ${ctx.conta.id}::uuid and criado_em >= date_trunc('month', now())`;
    return Response.json({
      saldo: ctx.conta.saldo,
      usadosNoMes: Number(mes.usados) - Number(mes.estornados),
      movimentos: movimentos.map((m) => ({ ...m, creditos: Number(m.creditos), saldo_apos: Number(m.saldo_apos) })),
    });
  } catch (e) {
    return responderErro(e);
  }
}
