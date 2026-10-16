import { Suspense } from "react";
import { MemoryPage } from "./MemoryPage";

export default function Page() {
  return (
    <Suspense fallback={<div className="wrap label py-16">Loading memory</div>}>
      <MemoryPage />
    </Suspense>
  );
}
