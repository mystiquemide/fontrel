"use client";

import { useState } from "react";
import { shortDate, type MemoryRow } from "@/lib/api";

type Action = "approved" | "rejected";

export function Decide({
  current,
  onSave,
}: {
  current?: MemoryRow;
  onSave: (action: Action, reason: string, by: string) => Promise<void>;
}) {
  const [open, setOpen] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [by, setBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!open) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(open, reason.trim(), by.trim() || "Pharmacist");
      setOpen(null);
      setReason("");
    } catch (e) {
      setError(e instanceof Error && e.message.length > 4 ? e.message : "The decision did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3">
      {current && !open && (
        <p className={`text-[14px] ${current.action === "approved" ? "text-clear" : "text-ink-2"}`}>
          {current.action === "approved" ? "Approved" : "Rejected"} by {current.by ?? "Pharmacist"}
          {current.at ? `, ${shortDate(current.at)}` : ""}
          {current.reason ? <span className="text-ink-3"> · &ldquo;{current.reason}&rdquo;</span> : null}
        </p>
      )}
      {!open ? (
        <div className="mt-2 flex gap-2">
          {(["approved", "rejected"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setOpen(a)}
              disabled={current?.action === a}
              className={
                a === "approved"
                  ? "rounded-full bg-clay px-4 py-1.5 text-[14px] font-medium text-canvas hover:bg-ink disabled:cursor-default disabled:opacity-40 disabled:hover:bg-clay"
                  : "rounded-full border-[1.5px] border-clay px-4 py-1.5 text-[14px] font-medium text-clay hover:bg-clay-tint disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
              }
            >
              {a === "approved" ? "Approve" : "Reject"}
            </button>
          ))}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="mt-2 rounded-[12px] border-[1.5px] border-line bg-canvas p-4"
        >
          <p className="font-medium">{open === "approved" ? "Approve this substitute" : "Reject this substitute"}</p>
          <label className="mt-3 block">
            <span className="label">Reason, optional</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              rows={2}
              className="mt-1 w-full rounded-[6px] border-[1.5px] border-line bg-canvas px-3 py-2 text-[15px] focus:border-clay focus:outline-none"
            />
            <span className="font-mono text-[12px] text-ink-3">{reason.length} / 500</span>
          </label>
          <label className="mt-2 block">
            <span className="label">Your name</span>
            <input
              value={by}
              onChange={(e) => setBy(e.target.value.slice(0, 80))}
              placeholder="Pharmacist"
              className="mt-1 w-full rounded-[6px] border-[1.5px] border-line bg-canvas px-3 py-2 text-[15px] placeholder:text-ink-3 focus:border-clay focus:outline-none"
            />
          </label>
          {error && <p className="mt-3 text-[14px] text-exposed">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-clay px-5 py-2 text-[15px] font-medium text-canvas hover:bg-ink disabled:opacity-50"
            >
              {saving ? "Saving" : "Save decision"}
            </button>
            <button type="button" onClick={() => setOpen(null)} className="link px-2 text-[15px] text-ink-2">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
