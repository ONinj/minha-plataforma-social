import { ErroHttp, contexto, responderErro, sql } from "@/lib/servidor/contexto";
import { plataformaConfigurada } from "@/lib/servidor/metricool";
import { dolarHoje } from "@/lib/servidor/painel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function exigirAdmin(req: Request) {
  const ctx = await contexto(req);
  if (!ctx.admin) throw new ErroHttp(403, "Somente administradores.");
  return ctx;
}

const FUSO = "America/Sao_Paulo";
type Alerta = { nivel: "erro" | "aviso" | "info"; texto: string };

/** Tudo que o dono da plataforma precisa ver: dinheiro, custos, clientes, alertas e configurações. */
export async function GET(req: Request) {
  try {
    await exigirAdmin(req);
    const db = sql();
    const [cfg] = await db`select cambio, precos, alerta_gasto_mensal from config_global where id = 1`;
    const cambio = Number(cfg.cambio);
    const margem = Number((cfg.precos as { margem_seguranca?: number }).margem_seguranca ?? 1);
    const inicioMes = db`date_trunc('month', now() at time zone ${FUSO}) at time zone ${FUSO}`;
    const inicioMesAnterior = db`(date_trunc('month', now() at time zone ${FUSO}) - interval '1 month') at time zone ${FUSO}`;

    const [contas] = await db`select count(*)::int as total,
        count(*) filter (where status = 'ativo')::int as ativas,
        count(*) filter (where status = 'teste')::int as teste,
        count(*) filter (where status = 'atrasado')::int as atrasadas,
        count(*) filter (where status = 'cancelado')::int as canceladas,
        count(*) filter (where criado_em >= ${inicioMes})::int as novas_mes,
        count(*) filter (where criado_em >= now() - interval '24 hours')::int as novas_24h,
        count(*) filter (where saldo < 0)::int as negativas,
        coalesce(sum(greatest(saldo, 0)), 0) as creditos_em_aberto
      from contas`;
    const planos = await db`select p.id, p.nome, p.preco, p.creditos_mensais, p.publico, p.ordem, (p.recursos->>'max_perfis')::int as max_perfis,
        count(c.id) filter (where c.status = 'ativo')::int as assinantes,
        coalesce(sum(coalesce(c.preco_custom, p.preco)) filter (where c.status = 'ativo'), 0) as receita
      from planos p left join contas c on c.plano_id = p.id group by p.id order by p.ordem`;
    const mrr = planos.reduce((s, p) => s + Number(p.receita), 0);

    const pag = await db`select
        coalesce(sum(valor) filter (where criado_em >= ${inicioMes} and not estornado), 0) as mes,
        coalesce(sum(coalesce(valor_liquido, valor)) filter (where criado_em >= ${inicioMes} and not estornado), 0) as mes_liquido,
        coalesce(sum(valor) filter (where criado_em >= ${inicioMesAnterior} and criado_em < ${inicioMes} and not estornado), 0) as mes_anterior,
        coalesce(sum(valor) filter (where tipo = 'recarga' and criado_em >= ${inicioMes} and not estornado), 0) as recargas_mes
      from pagamentos`.catch(() => [{ mes: 0, mes_liquido: 0, mes_anterior: 0, recargas_mes: 0 }]);
    const p0 = pag[0];

    const [uso] = await db`select
        coalesce(sum(custo_usd) filter (where criado_em >= ${inicioMes}), 0) as usd_mes,
        coalesce(sum(custo_usd) filter (where criado_em >= ${inicioMesAnterior} and criado_em < ${inicioMes}), 0) as usd_mes_anterior,
        coalesce(sum(custo_usd) filter (where criado_em >= now() - interval '24 hours'), 0) as usd_24h,
        coalesce(sum(-creditos) filter (where criado_em >= ${inicioMes}), 0) as creditos_mes,
        count(*) filter (where criado_em >= ${inicioMes})::int as acoes_mes
      from movimentos where tipo = 'uso'`;
    const custoMes = Number(uso.usd_mes) * cambio;

    // Gráfico: custo de IA e dinheiro recebido por dia (últimos 30 dias).
    const serie = await db`with dias as (
        select generate_series((now() at time zone ${FUSO})::date - 29, (now() at time zone ${FUSO})::date, interval '1 day')::date as dia)
      select to_char(d.dia, 'YYYY-MM-DD') as dia,
        coalesce((select sum(custo_usd) from movimentos m where m.tipo = 'uso' and (m.criado_em at time zone ${FUSO})::date = d.dia), 0) * ${cambio} as custo,
        coalesce((select sum(valor) from pagamentos g where not g.estornado and (g.criado_em at time zone ${FUSO})::date = d.dia), 0) as recebido
      from dias d order by d.dia`.catch(async () =>
      db`with dias as (select generate_series((now() at time zone ${FUSO})::date - 29, (now() at time zone ${FUSO})::date, interval '1 day')::date as dia)
        select to_char(d.dia, 'YYYY-MM-DD') as dia,
          coalesce((select sum(custo_usd) from movimentos m where m.tipo = 'uso' and (m.criado_em at time zone ${FUSO})::date = d.dia), 0) * ${cambio} as custo,
          0 as recebido from dias d order by d.dia`,
    );

    const categorias = await db`select
        case when descricao ilike 'Imagem%' then 'Imagens'
             when descricao ilike '%Seedance%' then 'Seedance'
             when descricao ilike '%Veo%' then 'Veo'
             when descricao ilike 'Transcri%' then 'Voz'
             else 'Claude' end as categoria,
        count(*)::int as vezes, coalesce(sum(custo_usd), 0) * ${cambio} as custo
      from movimentos where tipo = 'uso' and criado_em >= ${inicioMes}
      group by 1 order by 3 desc`;

    const topContas = await db`select c.id, c.nome, c.plano_id, c.status, c.saldo,
        coalesce(sum(m.custo_usd), 0) * ${cambio} as custo,
        coalesce(c.preco_custom, p.preco) as preco
      from contas c join planos p on p.id = c.plano_id
      left join movimentos m on m.conta_id = c.id and m.tipo = 'uso' and m.criado_em >= ${inicioMes}
      group by c.id, p.preco order by custo desc limit 8`;

    const gastoAlto = await db`select c.nome, coalesce(sum(m.custo_usd), 0) * ${cambio} as custo
      from movimentos m join contas c on c.id = m.conta_id
      where m.tipo = 'uso' and m.criado_em >= now() - interval '24 hours'
      group by c.id having sum(m.custo_usd) * ${cambio} > 50 order by 2 desc limit 5`;

    const recentes = await db`select g.id, g.tipo, g.valor, g.estornado, g.criado_em, c.nome
      from pagamentos g left join contas c on c.id = g.conta_id order by g.criado_em desc limit 15`.catch(() => []);

    const dolar = await dolarHoje();
    const alertaGasto = Number(cfg.alerta_gasto_mensal ?? 0);

    // ---------- Alertas ----------
    const alertas: Alerta[] = [];
    const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    if (alertaGasto && custoMes >= alertaGasto) alertas.push({ nivel: "erro", texto: `O gasto com IA no mês (${brl(custoMes)}) passou do limite de ${brl(alertaGasto)}.` });
    else if (alertaGasto && custoMes >= alertaGasto * 0.8) alertas.push({ nivel: "aviso", texto: `O gasto com IA já está em ${Math.round((custoMes / alertaGasto) * 100)}% do limite do mês.` });
    if (!alertaGasto) alertas.push({ nivel: "info", texto: "Defina um limite de gasto mensal com IA (em Configurações da plataforma, abaixo) para ser avisado." });
    const recebido = Number(p0.mes);
    if (recebido > 0 && custoMes > recebido * 0.7) alertas.push({ nivel: "aviso", texto: `O custo de IA (${brl(custoMes)}) já é ${Math.round((custoMes / recebido) * 100)}% do que entrou no mês. Confira preços, câmbio e as contas que mais gastam.` });
    if (dolar && Math.abs(dolar - cambio) / cambio > 0.03) alertas.push({ nivel: "aviso", texto: `O dólar hoje está em R$ ${dolar.toFixed(2)}, e os créditos usam R$ ${cambio.toFixed(2)}. Atualize o câmbio abaixo.` });
    if (contas.atrasadas) alertas.push({ nivel: "aviso", texto: `${contas.atrasadas} conta(s) com pagamento atrasado.` });
    if (contas.negativas) alertas.push({ nivel: "aviso", texto: `${contas.negativas} conta(s) com saldo negativo.` });
    for (const g of gastoAlto) alertas.push({ nivel: "aviso", texto: `"${g.nome}" gastou ${brl(Number(g.custo))} em IA nas últimas 24 h.` });
    if (contas.novas_24h > 20) alertas.push({ nivel: "aviso", texto: `${contas.novas_24h} contas novas em 24 h. Se não for campanha sua, pode ser abuso do teste grátis.` });
    if (process.env.ASAAS_API_KEY && process.env.ASAAS_AMBIENTE !== "producao") alertas.push({ nivel: "aviso", texto: "A cobrança está em modo de teste (sandbox). Para receber de verdade, coloque ASAAS_AMBIENTE = producao na Vercel." });
    if (!process.env.ASAAS_API_KEY) alertas.push({ nivel: "aviso", texto: "A cobrança (Asaas) ainda não está configurada." });

    const integracoes = [
      { nome: "Claude (Anthropic)", ok: !!process.env.ANTHROPIC_API_KEY },
      { nome: "Imagens e vídeos (fal.ai)", ok: !!process.env.FAL_KEY },
      { nome: "Cobrança (Asaas)", ok: !!process.env.ASAAS_API_KEY, detalhe: process.env.ASAAS_AMBIENTE === "producao" ? "produção" : "teste" },
      { nome: "Aviso de pagamento (webhook)", ok: !!process.env.ASAAS_WEBHOOK_TOKEN },
      { nome: "Metricool", ok: plataformaConfigurada() },
      { nome: "Instagram direto (Meta)", ok: !!(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET) },
      { nome: "Chave de criptografia", ok: !!process.env.CHAVE_CRIPTO },
      { nome: "WhatsApp de contato", ok: !!process.env.NEXT_PUBLIC_WHATSAPP },
    ];

    return Response.json({
      resumo: {
        ...contas,
        creditos_em_aberto: Number(contas.creditos_em_aberto),
        mrr,
        recebido_mes: recebido,
        recebido_mes_liquido: Number(p0.mes_liquido),
        recebido_mes_anterior: Number(p0.mes_anterior),
        recargas_mes: Number(p0.recargas_mes),
        custo_mes: custoMes,
        custo_mes_anterior: Number(uso.usd_mes_anterior) * cambio,
        custo_24h: Number(uso.usd_24h) * cambio,
        creditos_usados_mes: Number(uso.creditos_mes),
        acoes_mes: uso.acoes_mes,
        ticket_medio: contas.ativas ? mrr / contas.ativas : 0,
      },
      serie: serie.map((d) => ({ dia: d.dia, custo: Number(d.custo), recebido: Number(d.recebido) })),
      categorias: categorias.map((c) => ({ ...c, custo: Number(c.custo) })),
      topContas: topContas.map((c) => ({ ...c, custo: Number(c.custo), preco: Number(c.preco), saldo: Number(c.saldo) })),
      recentes: recentes.map((r) => ({ ...r, valor: Number(r.valor) })),
      planos: planos.map((p) => ({ ...p, preco: Number(p.preco), creditos_mensais: Number(p.creditos_mensais), receita: Number(p.receita) })),
      config: { cambio, margem, alerta_gasto_mensal: alertaGasto, dolar_hoje: dolar },
      alertas,
      integracoes,
    });
  } catch (e) {
    return responderErro(e);
  }
}

type Corpo =
  | { acao: "config"; cambio?: number; margem?: number; alerta?: number }
  | { acao: "plano"; id: string; preco: number; creditos: number; maxPerfis: number };

export async function POST(req: Request) {
  try {
    await exigirAdmin(req);
    const c = (await req.json()) as Corpo;
    const db = sql();
    if (c.acao === "config") {
      if (c.cambio != null) {
        if (!(c.cambio > 2 && c.cambio < 20)) throw new ErroHttp(400, "Câmbio fora do normal. Use, por exemplo, 5.45.");
        await db`update config_global set cambio = ${c.cambio} where id = 1`;
      }
      if (c.margem != null) {
        if (!(c.margem >= 1 && c.margem <= 3)) throw new ErroHttp(400, "A margem precisa ficar entre 1 (sem margem) e 3.");
        await db`update config_global set precos = jsonb_set(precos, '{margem_seguranca}', to_jsonb(${c.margem}::numeric)) where id = 1`;
      }
      if (c.alerta != null) {
        if (c.alerta < 0) throw new ErroHttp(400, "Limite inválido.");
        await db`update config_global set alerta_gasto_mensal = ${c.alerta} where id = 1`;
      }
      return Response.json({ ok: true });
    }
    if (c.acao === "plano") {
      if (!(c.preco >= 0 && c.creditos >= 0 && c.maxPerfis >= 1)) throw new ErroHttp(400, "Valores inválidos.");
      await db`update planos set preco = ${c.preco}, creditos_mensais = ${c.creditos},
        recursos = jsonb_set(recursos, '{max_perfis}', to_jsonb(${Math.round(c.maxPerfis)}::int)) where id = ${c.id}`;
      return Response.json({ ok: true });
    }
    throw new ErroHttp(400, "Ação inválida.");
  } catch (e) {
    return responderErro(e);
  }
}
