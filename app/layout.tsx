import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import LayoutShell from "./components/LayoutShell";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sentinel — AI Commerce OS",
  description: "Multi-store ecommerce analytics dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <head>
        {/* Prevent flash of wrong theme */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(localStorage.getItem('sentinel-theme')==='light')document.documentElement.classList.add('light')}catch(e){}})()` }} />
      </head>
      <body className="min-h-full" style={{ backgroundColor: "var(--bg)", color: "var(--text)" }}>
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
