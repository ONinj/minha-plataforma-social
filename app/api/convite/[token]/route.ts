import { hashToken } from "@/lib/servidor/aprovacao";
import { ErroHttp, responderErro, sql, usuarioDoToken } from "@/lib/servidor/contexto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVALIDO = "Este convite não existe mais, já foi usado ou venceu. Peça um novo para quem te convidou.";

async function conviteValido(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [c] = await sql()`select cv.id, cv.conta_id, cv.email, c.nome as conta from convites cv join contas c on c.id = cv.conta_id
    where cv.token_hash = ${hashToken(token)} and cv.aceito_em is null and not cv.cancelado and cv.expira_em > now()`;
  return c ?? null;
}

function mascarar(email: string) {
  const [u, d] = email.split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}@${d}`;
}

// Mostra de qual conta é o convite (sem expor o e-mail inteiro).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const c = await conviteValido(token);
    if (!c) throw new ErroHttp(404, INVALIDO);
    return Response.json({ conta: c.conta, email: mascarar(c.email) });
  } catch (e) {
    return responderErro(e);
  }
}

// Aceita o convite: só quem entrou com o mesmo e-mail convidado (e confirmado).
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const quem = await usuarioDoToken(req);
    if (!quem) throw new ErroHttp(401, "Entre na sua conta para aceitar o convite.", "sem_login");
    const c = await conviteValido(token);
    if (!c) throw new ErroHttp(404, INVALIDO);
    if (quem.email.toLowerCase() !== String(c.email).toLowerCase()) {
      throw new ErroHttp(403, `Este convite é para ${mascarar(c.email)}. Entre com esse e-mail para aceitar.`);
    }
    // O e-mail precisa estar confirmado no Supabase.
    const confirmado = await emailConfirmado(quem.token, quem.userId);
    if (!confirmado) throw new ErroHttp(403, "Confirme o seu e-mail (pelo link que chegou na sua caixa) e tente de novo.");
    const db = sql();
    await db`insert into membros (conta_id, user_id, papel) values (${c.conta_id}::uuid, ${quem.userId}::uuid, 'editor') on conflict do nothing`;
    await db`update convites set aceito_em = now() where id = ${c.id}::uuid`;
    return Response.json({ ok: true, conta: c.conta_id });
  } catch (e) {
    return responderErro(e);
  }
}

async function emailConfirmado(token: string, userId: string) {
  const { urlSupabase } = await import("@/lib/supabaseUrl");
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  try {
    const r = await fetch(`${urlSupabase()}/auth/v1/user`, { headers: { apikey: chave, Authorization: `Bearer ${token}` } });
    if (!r.ok) return false;
    const u = (await r.json()) as { id?: string; email_confirmed_at?: string | null };
    return u.id === userId && !!u.email_confirmed_at;
  } catch {
    return false;
  }
}
