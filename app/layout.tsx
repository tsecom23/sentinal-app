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
      <body className="min-h-full bg-[#07090F] text-zinc-100">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
