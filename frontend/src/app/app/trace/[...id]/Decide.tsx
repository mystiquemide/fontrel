"use client";

import { useEffect, useRef, useState } from "react";
import { DecisionError, shortDate, type MemoryRow } from "@/lib/api";

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
  const [justSaved, setJustSaved] = useState(false);
  const firstField = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const lastAction = useRef<Action | null>(null);
  const statusLine = useRef<HTMLParagraphElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (open) firstField.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      // the buttons were replaced while the form was open, so find the new one. After a save it is
      // disabled (that decision is made), so the saved message takes focus instead.
      requestAnimationFrame(() => {
        const btn = box.current?.querySelector<HTMLButtonElement>(`button[data-action="${lastAction.current}"]`);
        (btn && !btn.disabled ? btn : statusLine.current)?.focus();
      });
    }
  }, [open]);

  function close() {
    returnFocus.current = true;
    setOpen(null);
  }

  async function save() {
    if (!open) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(open, reason.trim(), by.trim() || "Pharmacist");
      setJustSaved(true);
      setReason("");
      close();
    } catch (e) {
      setError(e instanceof DecisionError ? e.message : "Your decision did not save. Check your connection and select Save decision again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={box} className="mt-3">
      {current && !open && (
        <p ref={statusLine} tabIndex={-1} role="status" className={`text-[14px] focus:outline-none ${current.action === "approved" ? "text-clear-deep" : "text-ink-2"}`}>
          {justSaved ? "Decision saved. " : ""}
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
              data-action={a}
              onClick={() => {
                lastAction.current = a;
                setJustSaved(false);
                setOpen(a);
              }}
              disabled={current?.action === a}
              className={
                a === "approved"
                  ? "rounded-full bg-clay px-4 py-1.5 text-[14px] font-medium text-canvas hover:bg-ink disabled:cursor-default disabled:opacity-40 disabled:hover:bg-clay"
                  : "rounded-full border-[1.5px] border-clay px-4 py-1.5 text-[14px] font-medium text-clay-deep hover:bg-clay-tint disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
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
          <p className="font-medium">{open === "approved" ? "Approve this candidate" : "Reject this candidate"}</p>
          <label className="mt-3 block">
            <span className="label">Reason (optional)</span>
            <textarea
              ref={firstField}
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              rows={2}
              className="mt-1 w-full rounded-[6px] border-[1.5px] border-line bg-canvas px-3 py-2 text-[15px] focus:border-clay focus:outline-none"
            />
            <span className="font-mono text-[12px] text-ink-3">{reason.length} / 500</span>
          </label>
          <label className="mt-2 block">
            <span className="label">Your name (optional)</span>
            <input
              value={by}
              onChange={(e) => setBy(e.target.value.slice(0, 80))}
              placeholder="Signed as Pharmacist if left blank"
              className="mt-1 w-full rounded-[6px] border-[1.5px] border-line bg-canvas px-3 py-2 text-[15px] placeholder:text-ink-3 focus:border-clay focus:outline-none"
            />
          </label>
          {error && (
            <p role="alert" className="mt-3 text-[14px] text-exposed">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-clay px-5 py-2 text-[15px] font-medium text-canvas hover:bg-ink disabled:opacity-50"
            >
              {saving ? "Saving" : "Save decision"}
            </button>
            <button type="button" onClick={close} className="link px-2 text-[15px] text-ink-2">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
