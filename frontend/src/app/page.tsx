import { Footer } from "@/components/Footer";
import { Hero } from "@/components/landing/Hero";
import { Compare } from "@/components/landing/Compare";
import { DataSources } from "@/components/landing/DataSources";
import { LiveCase } from "@/components/landing/LiveCase";
import { WhatWeTrace } from "@/components/landing/WhatWeTrace";
import { SiteNav } from "@/components/landing/SiteNav";

export default function Home() {
  return (
    <>
      <SiteNav
        links={[
          { href: "#how", label: "How it works" },
          { href: "#trace", label: "What we trace" },
          { href: "#sources", label: "Sources" },
        ]}
      />
      <main className="flex-1">
        <Hero />
        <LiveCase />
        <WhatWeTrace />
        <Compare />
        <DataSources />
      </main>
      <Footer />
    </>
  );
}
