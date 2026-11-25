/**
 * Endereço base do Supabase. Aceita o valor copiado com sobras (ex.: ".../rest/v1/"),
 * que é o que algumas telas do Supabase mostram, e devolve só "https://xxxx.supabase.co".
 */
export function urlSupabase(): string {
  const bruto = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  try {
    const u = new URL(bruto);
    return `${u.protocol}//${u.host}`;
  } catch {
    return bruto.replace(/\/(rest|auth|storage)\/v1.*$/, "").replace(/\/+$/, "");
  }
}
