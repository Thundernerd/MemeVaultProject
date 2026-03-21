import type { Metadata } from "next";
import { Geist } from "next/font/google";
import ThemeProvider from "@/components/ThemeProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MVP",
  description: "Media downloader and library",
  icons: {
    icon: '/safe.png',
    apple: '/apple-touch-icon.png',
  },
};

// Inline script applied before paint to avoid FOUC
const themeScript = `
(function() {
  try {
    var theme = localStorage.getItem('mvp-theme') || 'dark';
    var accent = localStorage.getItem('mvp-accent') || 'blue';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-accent', accent);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.setAttribute('data-accent', 'blue');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${geistSans.variable} antialiased text-text-primary`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
