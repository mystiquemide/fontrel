import { Footer } from "@/components/Footer";
import { Hero } from "@/components/landing/Hero";
import { LiveCase } from "@/components/landing/LiveCase";
import { SiteNav } from "@/components/landing/SiteNav";

export default function Home() {
  return (
    <>
      <SiteNav links={[{ href: "#how", label: "How it works" }]} />
      <main className="flex-1">
        <Hero />
        <LiveCase />
      </main>
      <Footer />
    </>
  );
}
