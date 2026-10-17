"use client";

import type { ReactNode } from "react";
import { SECTIONS, scrollToSection, type SectionId } from "./sections";

/** Link to a landing section by its clean URL, such as /trace. On the landing page it scrolls
 * there and updates the address bar; anywhere else it navigates to that URL. */
export function ScrollLink({ to, className, children }: { to: SectionId; className?: string; children: ReactNode }) {
  const href = `/${SECTIONS[to].path}`;
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        if (!scrollToSection(to)) return;
        e.preventDefault();
        window.history.pushState(null, "", href);
      }}
    >
      {children}
    </a>
  );
}
