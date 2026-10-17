import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<div className="h-[109px] border-b border-line md:h-16" />}>
        <AppHeader />
      </Suspense>
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
    </>
  );
}
