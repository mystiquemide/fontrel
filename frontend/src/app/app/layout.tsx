import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<div className="h-16 border-b border-line" />}>
        <AppHeader />
      </Suspense>
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
