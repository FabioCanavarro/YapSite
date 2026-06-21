import type { Metadata, Viewport } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YapSite | Voice Journal",
  description: "A premium, offline-first voice-to-structured-JSON PWA journal powered by Google Gemini 1.5 Flash.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "YapSite",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e1e2e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-base text-text">
        {children}
        <Toaster 
          theme="dark" 
          position="bottom-center"
          toastOptions={{
            style: {
              background: '#313244',
              color: '#cdd6f4',
              border: '1px solid rgba(205, 214, 244, 0.1)',
              borderRadius: '1rem',
            }
          }}
        />
      </body>
    </html>
  );
}
