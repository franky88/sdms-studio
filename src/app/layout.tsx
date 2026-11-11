import type { Metadata } from "next";
import "@fontsource-variable/unbounded";
import "@fontsource-variable/instrument-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quick Print | SDMS Print Studio",
  description: "Set your photo sizes, arrange your sheets, and download a print-ready PDF.",
  icons: { icon: "/sdms.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
