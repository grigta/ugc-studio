import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "UGC Studio",
  description: "Панель управления AI-инфлюенсером на RunPod",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap&subset=cyrillic,latin"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="layout">
          <Nav />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
