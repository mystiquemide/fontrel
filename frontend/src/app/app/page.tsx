import type { Metadata } from "next";
import { Suspense } from "react";
import { Inbox } from "./Inbox";

export const metadata: Metadata = { title: "Shortages" };

export default function AppPage() {
  return (
    <Suspense fallback={<div className="wrap py-16 label">Loading</div>}>
      <Inbox />
    </Suspense>
  );
}
