import Image from "next/image";
import Link from "next/link";
import syringes from "../../../public/images/syringes.jpg";

export function FinalCta() {
  return (
    <section className="relative isolate overflow-hidden">
      <Image
        src={syringes}
        alt="Three syringes with yellow, red and peach liquid on a pale blue surface"
        fill
        sizes="100vw"
        placeholder="blur"
        className="-z-10 object-cover object-[68%_88%] md:object-[70%_center]"
      />
      <div className="wrap flex min-h-[520px] flex-col justify-start pb-56 pt-16 md:min-h-[600px] md:pt-24">
        <h2 className="h2 max-w-[16ch] text-ink">
          The next shortage is already <span className="em">on its way.</span>
        </h2>
        <Link href="/app" className="mt-8 self-start rounded-full bg-clay px-6 py-3.5 font-medium text-canvas hover:bg-ink">
          Open the app
        </Link>
      </div>
    </section>
  );
}
