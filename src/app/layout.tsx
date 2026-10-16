import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: {
    default: "Parenthesys — La famiglia, in sincronia",
    template: "%s · Parenthesys",
  },
  description: "Calendario condiviso, attività e organizzazione intelligente per tutta la famiglia.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
