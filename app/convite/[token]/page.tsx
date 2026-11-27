import ConviteEquipe from "@/components/ConviteEquipe";

export const metadata = { title: "Convite para a equipe · Galhos", robots: { index: false, follow: false } };

export default async function Pagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ConviteEquipe token={token} />;
}
