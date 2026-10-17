"use client";

import { useEffect } from "react";
import { scrollToSection, sectionFromPath, type SectionId } from "./sections";

/** Opens the landing page at a section when it was reached by its clean URL. Sections that load
 * data grow after mount, so the scroll repeats briefly until the position settles. */
export function OpenSection({ id }: { id?: SectionId }) {
  // Back and Forward between section URLs move the page to match the address bar
  useEffect(() => {
    const onPop = () => {
      const target = sectionFromPath(window.location.pathname.slice(1));
      if (target) scrollToSection(target);
      else if (window.location.pathname === "/") window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!id) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      scrollToSection(id, false);
      if (++tries >= 8) window.clearInterval(timer);
    }, 150);
    const stop = () => window.clearInterval(timer);
    window.addEventListener("wheel", stop, { once: true, passive: true });
    window.addEventListener("touchstart", stop, { once: true, passive: true });
    return () => {
      stop();
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
    };
  }, [id]);
  return null;
}
