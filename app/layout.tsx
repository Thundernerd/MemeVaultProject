import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MVP",
  description: "Media downloader and library",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} antialiased bg-zinc-950 text-white min-h-screen`}>
        <Navigation />
        <main className="pt-14 md:pt-0 md:ml-52 min-h-screen px-6 pt-20 md:px-8 md:pt-8">{children}</main>
      </body>
    </html>
  );
}
