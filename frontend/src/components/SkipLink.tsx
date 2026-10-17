"use client";

/** Keyboard skip link that moves focus to the main content without adding #main to the URL. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="skip-link"
      onClick={(e) => {
        const main = document.getElementById("main");
        if (!main) return;
        e.preventDefault();
        main.focus();
        main.scrollIntoView();
      }}
    >
      Skip to content
    </a>
  );
}
