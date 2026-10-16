import { Suspense } from "react";
import { InboxTop } from "./InboxTop";

export default function AppPage() {
  return (
    <Suspense fallback={<div className="wrap py-16 label">Loading</div>}>
      <InboxTop />
    </Suspense>
  );
}
