import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Outfit } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner"
const outfit = Outfit({subsets:['latin'],variable:'--font-sans'});



export const metadata: Metadata = {
  title: "Doodles",
  description: "Live Drawing game ",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
}
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", outfit.variable)}>
      <body
        className={cn("font-sans", outfit.variable)}
      >
        {children}
        <Toaster/>
      </body>
    </html>
  );
}
