import Image from "next/image";
import shelves from "../../../public/images/medication-shelves.jpg";

export function ShelvesBand() {
  return (
    <section className="relative isolate flex min-h-[420px] items-end overflow-hidden bg-ink text-canvas">
      <Image
        src={shelves}
        alt="Rows of medication boxes on pharmacy shelves"
        fill
        sizes="100vw"
        placeholder="blur"
        className="-z-10 object-cover"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgba(42,43,47,0.94)_0%,rgba(42,43,47,0.82)_50%,rgba(42,43,47,0.25)_100%)]" />
      <div className="wrap w-full py-12">
        <p className="max-w-[30ch] font-display text-[clamp(28px,3vw,44px)] leading-[1.1]">
          Different names on the box. <span className="italic text-clay">Often the same plant</span> behind it.
        </p>
      </div>
    </section>
  );
}
