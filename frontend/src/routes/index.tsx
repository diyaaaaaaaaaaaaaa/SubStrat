import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ControlMark } from "@/components/substrat-logo";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "SubStrat — Delegate strategy. Never custody." },
    { name: "description", content: "Bounded on-chain strategy delegation that keeps assets in your custody." },
    { property: "og:title", content: "SubStrat — Delegate strategy. Never custody." },
    { property: "og:description", content: "Bounded on-chain strategy delegation that keeps assets in your custody." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Index,
});

function Index() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-7xl flex-col px-4 py-8 md:px-8 md:py-12">
      <div className="flex items-start justify-between border-b-3 border-ink pb-5">
        <p className="meta-label max-w-52">Non-custodial mandate control for on-chain positions</p>
        <ControlMark />
      </div>
      <div className="flex flex-1 flex-col justify-center py-10">
        <h1 className="font-display text-[clamp(5rem,18vw,15rem)] uppercase leading-[0.78] text-lime">SubStrat</h1>
        <div className="mt-8 grid gap-8 border-t-3 border-ink pt-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-2xl font-semibold md:text-4xl">Delegate strategy. Never custody.</p>
            <p className="mt-3 max-w-xl text-base leading-7">Set bounded permissions for a strategist while your assets stay under your control.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="poster" size="lg"><Link to="/dashboard">Open dashboard</Link></Button>
            <Button asChild variant="outline" size="lg"><Link to="/audit">View audit</Link></Button>
          </div>
        </div>
      </div>
      <footer className="meta-label border-t-3 border-ink pt-5">Built with 1inch Aqua · ENSv2 · Privy</footer>
    </main>
  );
}