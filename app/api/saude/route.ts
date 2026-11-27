import { urlSupabase } from "@/lib/supabaseUrl";
import { MODO_NUVEM, eAdminConfirmado, sql, usuarioDoToken } from "@/lib/servidor/contexto";
import { asaas, asaasEmProducao } from "@/lib/servidor/asaas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VARIAVEIS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "ANTHROPIC_API_KEY",
  "FAL_KEY",
  "ASAAS_API_KEY",
  "ASAAS_AMBIENTE",
  "ASAAS_WEBHOOK_TOKEN",
  "ADMIN_EMAILS",
  "NEXT_PUBLIC_WHATSAPP",
];

/**
 * Diagnóstico da configuração. Para qualquer pessoa: só "ok" ou "erro" de cada parte.
 * Para o administrador logado (token no cabeçalho): os detalhes (formato do banco, mensagens de erro, cobrança).
 * Nunca mostra o valor de nenhuma chave.
 */
export async function GET(req: Request) {
  const quem = await usuarioDoToken(req);
  const admin = quem ? await eAdminConfirmado(quem.userId, quem.email, quem.token) : false;
  const r: Record<string, unknown> = { modo: MODO_NUVEM ? "nuvem" : "local" };
  r.variaveis = Object.fromEntries(VARIAVEIS.map((v) => [v, process.env[v]?.trim() ? "ok" : "FALTANDO"]));
  r.endereco_supabase = urlSupabase() || "FALTANDO";

  const db = process.env.DATABASE_URL?.trim() ?? "";
  // Mostra o formato do endereço com a senha escondida, para conferir.
  const m = db.match(/^(\w+):\/\/([^:/@]*)(?::(.*))?@([^@]*)$/);
  r.banco_formato = !db
    ? "FALTANDO"
    : m
      ? `${m[1]}://${m[2]}:${m[3] ? "*".repeat(Math.min(m[3].length, 12)) : "(sem senha)"}@${m[4]}`
      : `formato não reconhecido; começa com "${db.slice(0, 14)}…"`;
  if (m?.[3] && /[@/:#?\s]/.test(m[3])) r.banco_senha = "a senha tem símbolos que quebram o endereço (@ / : # ? ou espaço): gere outra só com letras e números";
  if (/https?:\/\//.test(db)) r.banco_aviso = "o endereço contém 'https://': parece que foi colado o Project URL no meio. Use só o endereço postgresql:// do Transaction pooler";
  r.banco_endereco = !db
    ? "FALTANDO"
    : db.includes("[YOUR-PASSWORD]")
      ? "ERRO: ainda tem [YOUR-PASSWORD] no lugar da senha"
      : /:6543\//.test(db)
        ? "ok (porta 6543)"
        : "atenção: use o endereço do Transaction pooler (porta 6543)";
  try {
    const [t] = await sql()`select
      to_regclass('public.planos') is not null as planos,
      to_regclass('public.contas') is not null as contas,
      to_regclass('public.movimentos') is not null as movimentos,
      (select count(*) from pg_proc where proname = 'criar_conta_inicial')::int as funcoes`;
    r.banco_conexao = "ok";
    r.banco_tabelas = t.planos && t.contas && t.movimentos && t.funcoes ? "ok" : "FALTANDO: rode o SQL de supabase/migrations no SQL Editor";
  } catch (e) {
    r.banco_conexao = `ERRO: ${e instanceof Error ? e.message : String(e)}`;
  }

  try {
    const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
    const resp = await fetch(`${urlSupabase()}/auth/v1/settings`, { headers: { apikey: chave } });
    r.supabase_login = resp.ok ? "ok" : `ERRO ${resp.status}: confira a NEXT_PUBLIC_SUPABASE_ANON_KEY`;
  } catch (e) {
    r.supabase_login = `ERRO: ${e instanceof Error ? e.message : String(e)}`;
  }
  // Cobrança: qual ambiente está em uso, se a chave combina com ele e se os avisos (webhook) estão chegando.
  if (admin && process.env.ASAAS_API_KEY) {
    const prod = asaasEmProducao();
    r.asaas_ambiente_em_uso = prod ? "producao (cobrança real)" : `TESTE/sandbox (ASAAS_AMBIENTE está "${(process.env.ASAAS_AMBIENTE ?? "").trim() || "vazio"}"; para cobrar de verdade escreva producao)`;
    const chave = process.env.ASAAS_API_KEY.trim();
    const pareceTeste = chave.includes("_hmlg_"), pareceProd = chave.includes("_prod_");
    try {
      await asaas("/finance/balance");
      r.asaas_chave = "ok (funciona neste ambiente)";
    } catch (e) {
      r.asaas_chave = `ERRO: ${e instanceof Error ? e.message : String(e)}`;
      if (prod && pareceTeste) r.asaas_chave += " · a chave parece ser do sandbox, mas o ambiente é produção";
      if (!prod && pareceProd) r.asaas_chave += " · a chave parece ser de produção, mas o ambiente é teste";
    }
    try {
      const [c] = await sql()`select ultimo_webhook from config_global where id = 1`;
      const u = c?.ultimo_webhook as { resultado?: string; evento?: string; em?: string } | null;
      r.asaas_ultimo_aviso = u ? `${u.resultado}${u.evento ? ` (${u.evento})` : ""} em ${new Date(u.em ?? "").toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "nenhum aviso do Asaas chegou ainda (confira o webhook no painel do Asaas)";
    } catch {
      r.asaas_ultimo_aviso = "rode supabase/migrations/005_diagnostico_asaas.sql para ver isto";
    }
  }
  if (admin) return Response.json(r, { headers: { "Cache-Control": "no-store" } });
  const resumo = (v: unknown) => (typeof v === "string" && v.startsWith("ok") ? "ok" : v === undefined ? undefined : "ERRO");
  return Response.json(
    {
      modo: r.modo,
      variaveis: r.variaveis,
      banco_endereco: resumo(r.banco_endereco),
      banco_conexao: resumo(r.banco_conexao),
      banco_tabelas: resumo(r.banco_tabelas),
      supabase_login: resumo(r.supabase_login),
      detalhes: "Os detalhes aparecem só para o administrador logado (Administração → Visão geral → Diagnóstico).",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
