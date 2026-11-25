import { processarFila, renovarTokens } from "@/lib/servidor/instagram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Relógio: chamado a cada poucos minutos pelo agendador do Supabase (ou da Vercel).
async function rodar(req: Request) {
  const segredo = process.env.CRON_SECRET?.trim();
  const recebido = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!segredo || recebido !== segredo) return Response.json({ error: "não autorizado" }, { status: 401 });
  const publicacoes = await processarFila();
  await renovarTokens();
  return Response.json({ ok: true, publicacoes });
}

export const GET = rodar;
export const POST = rodar;
