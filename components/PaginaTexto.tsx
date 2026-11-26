/** Página simples de texto (privacidade, exclusão de dados), sem login. */
export default function PaginaTexto({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main style={{ position: "relative", zIndex: 1, maxWidth: 760, margin: "0 auto", padding: "48px 20px", lineHeight: 1.7 }}>
      <p style={{ color: "var(--destaque-2)", fontWeight: 700, margin: 0 }}>Galhos</p>
      <h1 style={{ letterSpacing: "-0.02em" }}>{titulo}</h1>
      <div className="ajuda" style={{ fontSize: 15, color: "var(--texto)" }}>{children}</div>
    </main>
  );
}
