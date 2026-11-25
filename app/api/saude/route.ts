import { urlSupabase } from "@/lib/supabaseUrl";
import { MODO_NUVEM, sql } from "@/lib/servidor/contexto";

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

/** Diagnóstico da configuração (não mostra nenhum valor secreto, só se existe e se funciona). */
export async function GET() {
  const r: Record<string, unknown> = { modo: MODO_NUVEM ? "nuvem" : "local" };
  r.variaveis = Object.fromEntries(VARIAVEIS.map((v) => [v, process.env[v]?.trim() ? "ok" : "FALTANDO"]));
  r.endereco_supabase = urlSupabase() || "FALTANDO";

  const db = process.env.DATABASE_URL?.trim() ?? "";
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
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
