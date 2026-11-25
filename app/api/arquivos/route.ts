import { caminhoDaConta, conferirCaminho, linkDeEnvio, linkDeLeitura, apagarArquivos } from "@/lib/servidor/arquivos";
import { contexto, responderErro } from "@/lib/servidor/contexto";

export const runtime = "nodejs";

/**
 * Links assinados do armazenamento da conta:
 * - { acao: "enviar", nome }      → link para o navegador enviar o arquivo direto (sem passar pelo servidor)
 * - { acao: "ler", caminhos[] }   → links de leitura (1 hora)
 * - { acao: "apagar", caminhos[] }
 */
export async function POST(req: Request) {
  try {
    const ctx = await contexto(req);
    const c = (await req.json()) as { acao: string; nome?: string; caminhos?: string[] };
    if (c.acao === "enviar") return Response.json(await linkDeEnvio(caminhoDaConta(ctx, c.nome ?? "arquivo")));
    const caminhos = (c.caminhos ?? []).slice(0, 100);
    caminhos.forEach((p) => conferirCaminho(ctx, p));
    if (c.acao === "ler") {
      const links: Record<string, string> = {};
      for (const p of caminhos) links[p] = await linkDeLeitura(p);
      return Response.json({ links });
    }
    if (c.acao === "apagar") {
      await apagarArquivos(caminhos);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e) {
    return responderErro(e);
  }
}
