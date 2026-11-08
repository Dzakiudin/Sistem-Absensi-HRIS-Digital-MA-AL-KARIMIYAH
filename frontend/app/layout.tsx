import type { Metadata, Viewport } from "next";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import appVersion from "./app-version.json";
import { AppRoot } from "./AppRoot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#047857",
};

export const metadata: Metadata = {
  title: "Absensi Guru - MA AL KARIMIYAH",
  description: "Sistem Absensi Guru Digital MA AL KARIMIYAH",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    shortcut: [{ url: "/logo.png", type: "image/png" }],
    apple: [{ url: "/logo.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" data-astryx-theme="neutral" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href={`/globals.css?v=${appVersion.version}`}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')==='dark'?'dark':'light';if(t==='dark'){document.documentElement.classList.add('dark');}document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-astryx-theme','neutral');}catch(e){}})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <AppRoot>{children}</AppRoot>
        <script defer src={`/app.js?v=${appVersion.version}`} />
      </body>
    </html>
  );
}
