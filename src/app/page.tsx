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
          <span className="brand-name">SDMS <span>Print Studio</span></span>
        </Link>
        <a className="site-link" href="https://www.sdms.digital/">SDMS Digital <ArrowUpRight size={15} aria-hidden /></a>
      </header>
      <main className="main-content">
        <div className="intro">
          <div className="intro-copy">
            <div className="eyebrow"><span aria-hidden /> Printing made simple</div>
            <h1>Quick Print<span>.</span></h1>
            <p>Choose your sizes. Add your photos. Get a print-ready PDF.</p>
          </div>
          <div className="intro-art" aria-hidden>
            <span className="art-sheet art-sheet-back" />
            <span className="art-sheet art-sheet-front">
              <span /><span /><span /><span />
            </span>
            <span className="art-caption">Made for your next print.</span>
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
