/** Landing sections and their clean URLs. Each path renders the landing page opened at that section. */
export const SECTIONS = {
  how: { path: "how-it-works", title: "How it works" },
  trace: { path: "trace", title: "What we trace" },
  sources: { path: "data-sources", title: "Data sources" },
  faq: { path: "faq", title: "FAQ" },
} as const;

export type SectionId = keyof typeof SECTIONS;

export function sectionFromPath(path: string): SectionId | undefined {
  return (Object.keys(SECTIONS) as SectionId[]).find((id) => SECTIONS[id].path === path);
}

export function scrollToSection(id: string, smooth = true) {
  const el = document.getElementById(id);
  if (!el) return false;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: smooth && !reduce ? "smooth" : "auto", block: "start" });
  return true;
}
