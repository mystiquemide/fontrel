import Image from "next/image";
import Link from "next/link";
import hero from "../../../public/images/pharmacist-aisle.jpg";
import { HeroStats } from "./HeroStats";
import { ScrollLink } from "./ScrollLink";

export function Hero() {
  return (
    <section className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-ink text-canvas lg:items-center">
      <Image
        src={hero}
        alt="A pharmacist in a white coat reads a medication box in a hospital pharmacy aisle"
        fill
        sizes="100vw"
        loading="eager"
        fetchPriority="high"
        placeholder="blur"
        className="-z-10 object-cover object-[22%_center]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgba(42,43,47,0.95)_0%,rgba(42,43,47,0.9)_62%,rgba(42,43,47,0.55)_100%)] lg:bg-[linear-gradient(to_left,rgba(42,43,47,0.9)_0%,rgba(42,43,47,0.78)_42%,rgba(42,43,47,0.15)_72%)]"
      />
      <div className="wrap w-full pb-14 pt-32 lg:py-32">
        <div className="lg:ml-auto lg:max-w-[600px]">
          <p className="label !text-canvas/75">Drug shortage response for hospital pharmacy</p>
          <h1 className="h1 mt-5">
            See the shortage <span className="block italic text-clay">behind the shortage.</span>
          </h1>
          <p className="mt-6 max-w-[52ch] text-[19px] leading-relaxed text-canvas/90">
            When a drug goes short, Fontrel traces it to the plant that makes it, finds the other drugs on your shelves made there, and shows substitutes made somewhere else.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/app" className="rounded-full bg-clay px-6 py-3.5 font-medium text-canvas hover:bg-canvas hover:text-ink">
              Open the app
            </Link>
            <ScrollLink to="how" className="text-[16px] text-canvas underline decoration-canvas/40 underline-offset-4 hover:decoration-canvas">
              See how it works
            </ScrollLink>
          </div>
          <div className="mt-12 border-t border-canvas/25 pt-6">
            <HeroStats />
          </div>
        </div>
      </div>
    </section>
  );
}
