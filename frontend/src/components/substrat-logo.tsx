import { Link } from "@tanstack/react-router";

export function ControlMark({ compact = false }: { compact?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 68 54" className={compact ? "h-8 w-10" : "h-12 w-16"}>
      <rect x="3" y="3" width="62" height="48" rx="3" className="fill-background stroke-ink" strokeWidth="5" />
      <path d="M23 12v30M45 12v30" className="stroke-ink" strokeWidth="4" />
      <circle cx="23" cy="22" r="7" className="fill-pink stroke-ink" strokeWidth="4" />
      <circle cx="45" cy="34" r="7" className="fill-lime stroke-ink" strokeWidth="4" />
    </svg>
  );
}

export function SubStratLogo() {
  return (
    <Link to="/" aria-label="SubStrat home" className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring">
      <ControlMark compact />
      <span className="font-display text-2xl uppercase leading-none">SubStrat</span>
    </Link>
  );
}