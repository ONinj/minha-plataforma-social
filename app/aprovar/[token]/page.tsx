import AprovacaoCliente from "@/components/AprovacaoCliente";

export const metadata = { title: "Aprovação de conteúdo · Galhos", robots: { index: false, follow: false } };

export default async function Pagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AprovacaoCliente token={token} />;
}
