import { ArrowUpRight, LockKeyhole } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { QuickPrint } from "@/components/studio/quick-print";

export default function Home() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="SDMS Print Studio home">
          <Image src="/sdms.svg" alt="" width={30} height={30} unoptimized />
          <span>SDMS <span>Print Studio</span></span>
        </Link>
        <a className="site-link" href="https://www.sdms.digital/">SDMS Digital <ArrowUpRight size={15} aria-hidden /></a>
      </header>
      <main className="main-content">
        <div className="intro">
          <div className="intro-copy">
            <div className="eyebrow"><span aria-hidden /> PHOTO SHEETS</div>
            <h1>Quick Print<span>.</span></h1>
            <p>Size, crop, and arrange your photos for print.</p>
          </div>
          <div className="intro-art" aria-hidden>
            <span className="ink-circle cyan" />
            <span className="ink-circle magenta" />
            <span className="ink-circle yellow" />
            <span className="registration-cross" />
          </div>
        </div>
        <QuickPrint />
      </main>
      <footer className="site-footer">
        <span>Smart Design &amp; Media Solutions</span>
        <span><LockKeyhole size={13} aria-hidden /> PDF export happens on this device</span>
      </footer>
    </div>
  );
}
