import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAccount, useReadContract } from "wagmi";
import { DataUnavailable, PageFrame } from "@/components/page-frame";
import {
  CONTRACTS,
  ENS_NAME,
  MANDATE_RESOURCE,
  ROLE_SET_TEXT,
  STRATEGIST_ADDRESS,
  controllerAbi,
  resolverAbi,
} from "@/lib/web3";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [
    { title: "Public Audit — SubStrat" },
    { name: "description", content: "Read-only public verification for SubStrat roles and mandate status." },
    { property: "og:title", content: "Public Audit — SubStrat" },
    { property: "og:description", content: "Read-only public verification for SubStrat roles and mandate status." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: Audit,
});

// Public audit view: reads happen against Sepolia via the app's own RPC
// transport, with no wallet connection required -- this is deliberately the
// same claim SubStrat makes to strategists and clients ("anyone can verify
// this independently"), so it can't quietly depend on a connected wallet.
function Audit() {
  const { address } = useAccount();

  const { data: isTunerActive, isLoading: roleLoading } = useReadContract({
    address: CONTRACTS.resolver,
    abi: resolverAbi,
    functionName: "hasRoles",
    args: [MANDATE_RESOURCE, ROLE_SET_TEXT, STRATEGIST_ADDRESS],
  });

  const { data: strategyHash, isLoading: hashLoading } = useReadContract({
    address: CONTRACTS.controller,
    abi: controllerAbi,
    functionName: "currentStrategyHash",
  });
  const hasActivePosition = !!strategyHash && strategyHash !== ("0x" + "0".repeat(64));

  const loading = roleLoading || hashLoading;

  const rows: [string, ReactNode][] = [
    ["Resolved identity", ENS_NAME],
    ["Strategist (Tuner)", STRATEGIST_ADDRESS],
    ["Role status", loading ? "Checking on-chain…" : isTunerActive ? "Active" : "Revoked"],
    ["Active position", loading ? "Checking on-chain…" : hasActivePosition ? "Yes" : "No"],
    ["Strategy hash", strategyHash ?? "—"],
    ["StrategyController", CONTRACTS.controller],
    ["Resolver (ENS)", CONTRACTS.resolver],
    ["Network", "Sepolia"],
    ["Your wallet", address ?? "Not connected (not required to view this page)"],
  ];

  return (
    <PageFrame eyebrow="Read-only / public record" title="Audit view">
      <DataUnavailable>
        Every value below is read live from Sepolia — the same {isTunerActive ? "Active" : "Revoked"} status the mandate panel and client dashboard see, independently verifiable by anyone with a browser and no wallet required.
      </DataUnavailable>
      <section className="poster-panel mt-6 bg-offwhite">
        <div className={`border-b-3 border-ink p-6 ${loading ? "bg-offwhite" : isTunerActive ? "bg-lime" : "bg-pink"}`}>
          <p className="meta-label">Mandate record</p>
          <h2 className="mt-2 font-display text-4xl uppercase md:text-6xl">
            {loading ? "Loading…" : isTunerActive ? "Tuner authorized" : "Tuner revoked"}
          </h2>
        </div>
        <dl>
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-2 border-b-3 border-ink p-5 last:border-b-0 md:grid-cols-[14rem_1fr]">
              <dt className="meta-label">{label}</dt>
              <dd className="break-all font-mono text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <a
          className="poster-panel bg-offwhite p-4 text-center font-mono text-xs underline"
          href={`https://sepolia.etherscan.io/address/${CONTRACTS.controller}`}
          target="_blank" rel="noreferrer"
        >
          View StrategyController on Etherscan
        </a>
        <a
          className="poster-panel bg-offwhite p-4 text-center font-mono text-xs underline"
          href={`https://sepolia.etherscan.io/address/${CONTRACTS.resolver}`}
          target="_blank" rel="noreferrer"
        >
          View resolver on Etherscan
        </a>
        <a
          className="poster-panel bg-offwhite p-4 text-center font-mono text-xs underline"
          href={`https://explorer.ens.dev/name/${ENS_NAME}`}
          target="_blank" rel="noreferrer"
        >
          Resolve {ENS_NAME} on ENS explorer
        </a>
      </section>
      <p className="meta-label mt-8 border-t-3 border-ink pt-5">Roles · permissions · changes · independently readable</p>
    </PageFrame>
  );
}