export function novoId(prefixo: string): string {
  return `${prefixo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function agoraISO(): string {
  return new Date().toISOString();
}

export function mesAtual(): string {
  return new Date().toISOString().slice(0, 7);
}

export function brl(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(",")[1] ?? "");
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

export function base64ParaBlob(base64: string, mime: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Reduz uma imagem para JPEG (economiza tokens e tamanho das requisições). */
export async function reduzirImagem(blob: Blob, ladoMax: number, qualidade = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao converter imagem"))), "image/jpeg", qualidade),
  );
}

export function formatarData(iso?: string): string {
  if (!iso) return "sem data";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function baixarArquivo(url: string, nome: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
}

/** Só deixa passar links https (evita links "javascript:" ou de outros tipos vindos de fora). */
export function linkSeguro(url: string | null | undefined): string | undefined {
  return url && /^https:\/\//i.test(url.trim()) ? url.trim() : undefined;
}
