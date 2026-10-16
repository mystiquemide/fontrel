import { Suspense } from "react";
import { Inbox } from "./Inbox";

export default function AppPage() {
  return (
    <Suspense fallback={<div className="wrap py-16 label">Loading</div>}>
      <Inbox />
    </Suspense>
  );
}
