import { Footer } from "@/components/Footer";
import { Compare } from "./Compare";
import { DataSources } from "./DataSources";
import { Faq } from "./Faq";
import { FinalCta } from "./FinalCta";
import { Hero } from "./Hero";
import { LiveCase } from "./LiveCase";
import { OpenSection } from "./OpenSection";
import type { SectionId } from "./sections";
import { SiteNav } from "./SiteNav";
import { WhatWeTrace } from "./WhatWeTrace";

export function Landing({ section }: { section?: SectionId }) {
  return (
    <>
      <SiteNav />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Hero />
        <LiveCase />
        <WhatWeTrace />
        <Compare />
        <DataSources />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <OpenSection id={section} />
    </>
  );
}
