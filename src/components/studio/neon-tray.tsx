import { NEON_PALETTES, type NeonId } from "@/lib/neon";
import { cn } from "@/lib/utils";

export function NeonTray({
  value,
  onChange,
}: {
  value: NeonId;
  onChange: (id: NeonId) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Paleta neón"
      className="flex items-center gap-1"
    >
      {NEON_PALETTES.map((palette) => {
        const on = palette.id === value;
        return (
          <button
            key={palette.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={palette.label}
            title={palette.label}
            onClick={() => onChange(palette.id)}
            className={cn(
              "neon-dot size-9 shrink-0 md:size-7",
              on && "neon-dot-on",
            )}
            data-neon-dot={palette.id}
          />
        );
      })}
    </div>
  );
}
