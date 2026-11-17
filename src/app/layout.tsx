import type { Metadata } from "next";
import "@fontsource/lato/400.css";
import "@fontsource/lato/700.css";
import "@fontsource/lato/900.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quick Print | SDMS Print Studio",
  description: "Printing made simple. Choose your photo sizes, arrange your sheets, and download a print-ready PDF with SDMS Print Studio.",
  icons: { icon: "/sdms.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
