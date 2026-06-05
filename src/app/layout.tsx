import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agente WhatsApp",
  description: "Dashboard de conversaciones WhatsApp con IA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      {/* Script síncrono: aplica el tema antes del primer render para evitar flash */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
