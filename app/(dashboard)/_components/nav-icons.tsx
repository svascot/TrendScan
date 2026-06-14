import type { SVGProps } from "react";

/**
 * Thin-stroke geometric icons (Lucide / SF Symbols aesthetic).
 * 24×24 grid, 1.5 stroke, round caps/joins — rendered with `currentColor`
 * so the consuming nav controls the tint via text color.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

// Scanner — radar / target acquisition
export function ScannerIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
    </Base>
  );
}

// GMMA — momentum pulse
export function GmmaIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 12h3.5l2.5-6 4 13 2.5-7H21" />
    </Base>
  );
}

// Watchlist — star
export function WatchlistIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.77 6.99 19.5l.99-5.79-4.21-4.1 5.82-.85z" />
    </Base>
  );
}

// Portfolio — briefcase
export function PortfolioIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5M3 12.5h18" />
    </Base>
  );
}

// Settings — sliders
export function SettingsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </Base>
  );
}

// Log out — door with exit arrow
export function LogoutIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H9" />
      <path d="M15.5 8.5 19 12l-3.5 3.5M19 12H9.5" />
    </Base>
  );
}
