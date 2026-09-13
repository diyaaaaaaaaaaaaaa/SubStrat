import type { ReactNode } from "react";
import { ControlMark } from "./substrat-logo";

export function PageFrame({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">
      <header className="mb-8 flex items-end justify-between gap-6 border-b-3 border-ink pb-5">
        <div>
          <p className="meta-label mb-2">{eyebrow}</p>
          <h1 className="font-display text-5xl uppercase leading-none sm:text-7xl">{title}</h1>
        </div>
        <ControlMark />
      </header>
      {children}
    </main>
  );
}

export function DataUnavailable({ children }: { children: ReactNode }) {
  return (
    <div className="poster-panel bg-offwhite p-5">
      <p className="meta-label mb-2">Live chain data</p>
      <p className="max-w-xl text-sm leading-6">{children}</p>
    </div>
  );
}

export function StatCard({ label, value, tone = "offwhite" }: { label: string; value: string; tone?: "offwhite" | "pink" | "lime" }) {
  const toneClass = tone === "pink" ? "bg-pink" : tone === "lime" ? "bg-lime" : "bg-offwhite";
  return (
    <article className={`poster-panel min-h-40 p-5 ${toneClass}`}>
      <p className="meta-label">{label}</p>
      <p className="mt-7 font-display text-4xl uppercase leading-none md:text-5xl">{value}</p>
    </article>
  );
}