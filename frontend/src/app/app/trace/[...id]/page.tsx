import { Suspense } from "react";
import { Trace } from "./Trace";

export default function TracePage() {
  return (
    <Suspense fallback={<div className="wrap label py-16">Loading trace</div>}>
      <Trace />
    </Suspense>
  );
}
