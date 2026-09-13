import { Link, useRouterState } from "@tanstack/react-router";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button";
import { SubStratLogo } from "./substrat-logo";

const links = [
  { to: "/dashboard" as const, label: "Client" },
  { to: "/mandate" as const, label: "Strategist" },
  { to: "/audit" as const, label: "Audit" },
];

export function SiteHeader() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const connector = connectors[0];

  return (
    <header className="border-b-3 border-ink bg-background">
      <div className="mx-auto flex min-h-18 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
        <SubStratLogo />
        <nav aria-label="Primary navigation" className="order-3 flex w-full items-center gap-1 overflow-x-auto md:order-2 md:w-auto">
          {links.map((link) => (
            <Link key={link.to} to={link.to} className={`meta-label border-2 border-ink px-3 py-2 ${pathname === link.to ? "bg-ink text-background" : "bg-transparent"}`}>
              {link.label}
            </Link>
          ))}
        </nav>
        <Button className="order-2 md:order-3" variant="outline" onClick={() => isConnected ? disconnect() : connector && connect({ connector })} disabled={!isConnected && !connector}>
          {isConnected && address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Connect wallet"}
        </Button>
      </div>
    </header>
  );
}