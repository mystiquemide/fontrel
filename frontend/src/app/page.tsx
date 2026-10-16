import { Footer } from "@/components/Footer";
import { Hero } from "@/components/landing/Hero";
import { SiteNav } from "@/components/landing/SiteNav";

export default function Home() {
  return (
    <>
      <SiteNav links={[]} />
      <main className="flex-1">
        <Hero />
      </main>
      <Footer />
    </>
  );
}
