const ROWS: [string, boolean][] = [
  ["Tells you a drug is short", true],
  ["Shows the plant that makes it", false],
  ["Finds your other drugs made at that plant", false],
  ["Checks a substitute is made at a different plant", false],
  ["Remembers what your team chose last time", false],
  ["Shows the query behind every answer", false],
];

function Mark({ yes, onClay }: { yes: boolean; onClay?: boolean }) {
  return yes ? (
    <span className="inline-flex items-center gap-2">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r="11" fill={onClay ? "#FEF9EF" : "#2A2B2F"} />
        <path d="M6.5 11.5 L9.5 14.5 L15.5 8" fill="none" stroke={onClay ? "#B05A36" : "#FEF9EF"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">Yes</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-2">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r="10.25" fill="none" stroke="#D1C9BF" strokeWidth="1.5" />
        <path d="M8 8 L14 14 M14 8 L8 14" stroke="#666666" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="sr-only">No</span>
    </span>
  );
}

export function Compare() {
  return (
    <section className="py-[clamp(48px,7vw,96px)]">
      <div className="wrap">
        <h2 className="h2 text-center">
          A shortage list vs <span className="em">Fontrel</span>
        </h2>
        <div className="mx-auto mt-12 max-w-[920px] overflow-hidden rounded-[20px]">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                <th className="w-[56%] bg-panel p-4 md:px-6"><span className="sr-only">Capability</span></th>
                <th className="bg-panel p-4 text-center font-mono text-[12px] font-normal uppercase tracking-[0.08em] text-ink-3">Shortage list</th>
                <th className="bg-clay p-4 text-center font-display text-[20px] font-normal text-canvas">fontrel</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, list]) => (
                <tr key={label}>
                  <td className="border-t border-line bg-panel p-4 text-[15px] md:px-6 md:text-[17px]">{label}</td>
                  <td className="border-t border-line bg-panel p-4 text-center"><Mark yes={list} /></td>
                  <td className="border-t border-canvas/25 bg-clay p-4 text-center"><Mark yes onClay /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
