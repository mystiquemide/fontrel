import type { Metadata } from "next";
import { Suspense } from "react";
import { SourcesPage } from "./SourcesPage";

export const metadata: Metadata = { title: "Sources" };

export default function Page() {
  return (
    <Suspense fallback={<div className="wrap label py-16">Loading sources</div>}>
      <SourcesPage />
    </Suspense>
  );
}
