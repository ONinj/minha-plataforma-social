import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Galhos",
  description: "Plataforma pessoal de gestão de redes sociais com Claude, Gemini, Veo e Seedance.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f1115" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
