const QA: [string, string][] = [
  [
    "Does Fontrel tell me what to use instead?",
    "It proposes substitutes and shows why each one is safe or not. A pharmacist approves or rejects every one. Fontrel never chooses a drug or a dose.",
  ],
  [
    "Where does the plant information come from?",
    "From the establishment section of each FDA drug label on DailyMed, which lists the plants that make, pack and label the product.",
  ],
  [
    "What does “No site on file” mean?",
    "The label lists no manufacturing plant, so Fontrel cannot show the substitute is made somewhere independent. It says so instead of guessing.",
  ],
  [
    "Is my hospital's data shared?",
    "No. Each hospital has its own graph. One hospital never sees another hospital's formulary or decisions.",
  ],
  [
    "What runs underneath?",
    "A FalkorDB graph of products, plants, suppliers and shortages, and an AI agent that can only read it. The only write is a pharmacist's approve or reject.",
  ],
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-28 md:scroll-mt-20 py-[clamp(48px,7vw,96px)]">
      <div className="wrap grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <h2 className="h2">
          Questions, <span className="em">answered.</span>
        </h2>
        <div className="border-b border-line">
          {QA.map(([q, a]) => (
            <details key={q} className="group border-t border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[19px] font-medium hover:text-clay [&::-webkit-details-marker]:hidden">
                {q}
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-45">
                  <path d="M9 3 V15 M3 9 H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </summary>
              <p className="max-w-[62ch] pb-6 text-ink-2">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
