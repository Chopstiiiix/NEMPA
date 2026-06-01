// Nav icons with outline (unselected) and color-filled (selected) variants.
// Filled uses the accent color passed via `fill`; outline uses currentColor.

interface IconProps { active: boolean; size?: number }

export function BellIcon({ active, size = 22 }: IconProps) {
  return active ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--brand)" aria-hidden="true">
      <path d="M12 2a6.5 6.5 0 0 0-6.5 6.5c0 3.6-1.2 5.5-2.1 6.6A1.1 1.1 0 0 0 4.3 17h15.4a1.1 1.1 0 0 0 .9-1.9c-.9-1.1-2.1-3-2.1-6.6A6.5 6.5 0 0 0 12 2Z" />
      <path d="M9.5 19a2.5 2.5 0 0 0 5 0Z" />
    </svg>
  ) : (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5" />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function PersonIcon({ active, size = 22 }: IconProps) {
  return active ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--brand)" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M12 14c-4.4 0-8 2.4-8 5.4 0 .9.7 1.6 1.6 1.6h12.8c.9 0 1.6-.7 1.6-1.6 0-3-3.6-5.4-8-5.4Z" />
    </svg>
  ) : (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
    </svg>
  );
}
