type Variant = "clay" | "cream";

export function Mark({ size = 32, variant = "clay" }: { size?: number; variant?: Variant }) {
  const fill = variant === "clay" ? "#B05A36" : "#FEF9EF";
  const stroke = variant === "clay" ? "#FEF9EF" : "#B05A36";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="32" fill={fill} />
      <g fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 34 H28" />
        <path d="M28 34 C36 34 40 22 54 22" />
        <path d="M28 34 C33 34 35 40 39 42" />
        <path d="M47 45.5 L50 46.5" />
      </g>
    </svg>
  );
}

export function Logo({ size = 32, variant = "clay" }: { size?: number; variant?: Variant }) {
  return (
    <span className="inline-flex items-center" style={{ gap: size / 4 }}>
      <Mark size={size} variant={variant} />
      <span className="font-display leading-none" style={{ fontSize: size * 0.9 }}>
        fontrel
      </span>
    </span>
  );
}
