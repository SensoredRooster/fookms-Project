import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Station Inventory",
  description: "Shared stock counts and transfers across stations.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
