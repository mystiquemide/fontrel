import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="wrap focus:outline-none flex flex-1 flex-col items-start justify-center py-24">
      <Logo size={32} />
      <h1 className="h2 mt-10">
        This page <span className="em">isn&rsquo;t here.</span>
      </h1>
      <p className="mt-4 text-ink-2">The link may be old, or the address may have a typo.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/app" className="rounded-full bg-clay px-6 py-3.5 font-medium text-canvas hover:bg-ink">
          Open the shortage list
        </Link>
        <Link href="/" className="rounded-full border-[1.5px] border-clay px-6 py-3.5 font-medium text-clay-deep hover:bg-clay-tint">
          Go to the home page
        </Link>
      </div>
    </main>
  );
}
