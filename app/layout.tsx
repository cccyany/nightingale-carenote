import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nightingale CareNote",
  description: "Synthetic longitudinal care-note workspace"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
