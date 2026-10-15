import { useId } from "react";
import { cn } from "@/lib/utils";

function pt(deg: number, radius: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(20 + radius * Math.cos(a)).toFixed(2)} ${(20 + radius * Math.sin(a)).toFixed(2)}`;
}

function bladePath(index: number) {
  const start = index * 60;
  return `M${pt(start - 2, 12.95)} L${pt(start + 46, 12.95)} L${pt(start + 58, 7.05)} L${pt(start + 12, 7.05)} Z`;
}

export function LumenMark({ className }: { className?: string }) {
  const uid = useId();
  const fill = `${uid}-fill`;
  const clip = `${uid}-clip`;

  return (
    <svg viewBox="0 0 40 40" className={cn("hud-icon shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient
          id={fill}
          x1="10"
          y1="2"
          x2="30"
          y2="38"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="var(--color-brand-hi)" />
          <stop offset="1" stopColor="var(--color-brand)" />
        </linearGradient>
        <clipPath id={clip}>
          <circle cx="20" cy="20" r="13" />
        </clipPath>
      </defs>
      <circle
        cx="20"
        cy="20"
        r="17.1"
        fill={`url(#${fill})`}
        stroke="var(--color-brand-fg)"
        strokeWidth="2.5"
      />
      <g
        clipPath={`url(#${clip})`}
        fill="var(--color-brand-fg)"
        stroke="var(--color-brand-fg)"
        strokeWidth="0.35"
        strokeLinejoin="round"
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path key={i} d={bladePath(i)} />
        ))}
      </g>
      <circle cx="20" cy="20" r="7" fill={`url(#${fill})`} />
      <circle cx="20" cy="20" r="7" fill="none" stroke="var(--color-brand-fg)" strokeWidth="1.45" />
    </svg>
  );
}
