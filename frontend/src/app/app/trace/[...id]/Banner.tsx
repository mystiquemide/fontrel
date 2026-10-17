import type { TraceAnswer } from "@/lib/api";
import { MONTHS } from "@/lib/api";

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${hh}:${mm}`;
}

export function Banner({ answer, onFresh }: { answer: TraceAnswer; onFresh: () => void }) {
  let text: string | null = null;
  if (answer.degraded) text = "The AI model wasn't available for this trace, so this answer comes straight from the graph without a written summary.";
  else if (answer.replayed && answer.cached_at)
    text = `Saved trace from ${when(answer.cached_at)}. Your hospital's memory has not changed since.`;
  if (!text) return null;
  return (
    <div className="mt-8 flex flex-col gap-3 rounded-[20px] bg-panel px-6 py-5 md:flex-row md:items-center md:justify-between">
      <p className="text-ink-2">{text}</p>
      <button onClick={onFresh} className="link shrink-0 self-start py-1.5 text-[15px] font-medium text-ink md:self-auto">
        Run a fresh trace
      </button>
    </div>
  );
}
