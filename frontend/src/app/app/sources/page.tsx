import { Suspense } from "react";
import { SourcesPage } from "./SourcesPage";

export default function Page() {
  return (
    <Suspense fallback={<div className="wrap label py-16">Loading sources</div>}>
      <SourcesPage />
    </Suspense>
  );
}
