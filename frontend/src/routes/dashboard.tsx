import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { formatUnits } from "viem";
import { Button } from "@/components/ui/button";
import { DataUnavailable, PageFrame, StatCard } from "@/components/page-frame";
import {
  CONTRACTS,
  ENS_NAME,
  KNOWN_PRICE_BAND,
  MANDATE_RESOURCE,
  MANDATE_TEXT_KEY,
  ROLE_SET_TEXT,
  STRATEGIST_ADDRESS,
  controllerAbi,
  dnsEncodeName,
  erc20Abi,
  resolverAbi,
} from "@/lib/web3";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [
    { title: "Client Dashboard — SubStrat" },
    { name: "description", content: "Review and control your delegated SubStrat position." },
    { property: "og:title", content: "Client Dashboard — SubStrat" },
    { property: "og:description", content: "Review and control your delegated SubStrat position." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Dashboard,
});

function Dashboard() {
  const { address, isConnected } = useAccount();

  const { data: strategyHash, isLoading: hashLoading } = useReadContract({
    address: CONTRACTS.controller,
    abi: controllerAbi,
    functionName: "currentStrategyHash",
    query: { enabled: isConnected },
  });
  const hasActivePosition = !!strategyHash && strategyHash !== ("0x" + "0".repeat(64));

  const { data: isTunerActive, isLoading: roleLoading, refetch: refetchRole } = useReadContract({
    address: CONTRACTS.resolver,
    abi: resolverAbi,
    functionName: "hasRoles",
    args: [MANDATE_RESOURCE, ROLE_SET_TEXT, STRATEGIST_ADDRESS],
    query: { enabled: isConnected },
  });

  const { data: balances, isLoading: balancesLoading } = useReadContracts({
    contracts: [
      { address: CONTRACTS.token0, abi: erc20Abi, functionName: "balanceOf", args: [CONTRACTS.controller] },
      { address: CONTRACTS.token1, abi: erc20Abi, functionName: "balanceOf", args: [CONTRACTS.controller] },
      { address: CONTRACTS.token0, abi: erc20Abi, functionName: "symbol" },
      { address: CONTRACTS.token1, abi: erc20Abi, functionName: "symbol" },
    ],
    query: { enabled: isConnected },
  });

  const { writeContract: revoke, data: revokeHash, isPending: revokePending } = useWriteContract();
  const { isLoading: revokeConfirming, isSuccess: revokeConfirmed } = useWaitForTransactionReceipt({ hash: revokeHash });

  const { writeContract: emergencyDock, data: dockHash, isPending: dockPending } = useWriteContract();
  const { isLoading: dockConfirming, isSuccess: dockConfirmed } = useWaitForTransactionReceipt({ hash: dockHash });

  function handleRevoke() {
    revoke({
      address: CONTRACTS.resolver,
      abi: resolverAbi,
      functionName: "authorizeTextRoles",
      args: [dnsEncodeName(ENS_NAME), MANDATE_TEXT_KEY, STRATEGIST_ADDRESS, false],
    });
  }

  function handleEmergencyDock() {
    emergencyDock({
      address: CONTRACTS.controller,
      abi: controllerAbi,
      functionName: "emergencyDock",
    });
  }

  // Refetch the role check after a revoke confirms, so the badge flips live
  // without a manual page reload -- this is the actual demo beat. Must run in
  // an effect, not directly in the render body: calling refetchRole() during
  // render fires on every re-render for as long as revokeConfirmed stays
  // true (wagmi doesn't reset isSuccess until a new write), which was
  // hammering the RPC with duplicate reads and could visibly stutter the
  // live-revoke demo beat instead of cleanly flipping the badge once.
  useEffect(() => {
    if (revokeConfirmed) refetchRole();
  }, [revokeConfirmed, refetchRole]);

  const positionValue =
    isConnected && balances && balances.every((b) => b.status === "success")
      ? `${formatUnits(balances[0].result as bigint, 18)} ${balances[2].result} / ${formatUnits(balances[1].result as bigint, 18)} ${balances[3].result}`
      : isConnected
        ? "Loading…"
        : "—";

  const statusLabel = !isConnected ? "—" : roleLoading ? "Loading…" : isTunerActive ? "Active" : "Revoked";

  return (
    <PageFrame eyebrow="Owner controls / Sepolia" title="Client dashboard">
      {!isConnected && <DataUnavailable>Connect your wallet to read your deployed mandate and position directly from the network.</DataUnavailable>}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <StatCard label="Position value" value={positionValue} tone="pink" />
        <StatCard label="Current range" value={isConnected ? `${KNOWN_PRICE_BAND.min} – ${KNOWN_PRICE_BAND.max}` : "—"} />
        <StatCard label="Mandate status" value={statusLabel} tone={isTunerActive ? "lime" : "offwhite"} />
      </div>
      <section className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="poster-panel bg-offwhite p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-3 border-ink pb-4">
            <div>
              <p className="meta-label">Open position</p>
              <h2 className="mt-2 font-display text-3xl uppercase">
                {!isConnected ? "No mandate loaded" : hashLoading ? "Loading…" : hasActivePosition ? "Mandate live" : "No active position"}
              </h2>
            </div>
            <span className="meta-label border-2 border-ink bg-offwhite px-3 py-2">{statusLabel}</span>
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div><dt className="meta-label">Strategist</dt><dd className="mt-2 break-all font-mono text-sm">{STRATEGIST_ADDRESS}</dd></div>
            <div><dt className="meta-label">Owner</dt><dd className="mt-2 break-all font-mono text-sm">{address ?? "Wallet not connected"}</dd></div>
          </dl>
        </div>
        <div className="poster-panel flex min-h-64 flex-col items-center justify-center bg-pink p-6">
          <div className="relative grid size-36 place-items-center rounded-full border-4 border-ink bg-offwhite before:absolute before:inset-4 before:rounded-full before:border-4 before:border-ink">
            <span className="meta-label z-10 text-center">
              {isConnected ? `${KNOWN_PRICE_BAND.min}\u2013${KNOWN_PRICE_BAND.max}` : <>Range<br />unavailable</>}
            </span>
          </div>
        </div>
      </section>
      <section className="mt-6 grid gap-4 md:grid-cols-[1fr_auto]">
        <Button
          variant="poster"
          className="h-24 w-full text-3xl md:text-5xl"
          disabled={!isConnected || !isTunerActive || revokePending || revokeConfirming}
          onClick={handleRevoke}
        >
          {revokePending || revokeConfirming ? "Revoking…" : "Revoke access"}
        </Button>
        <Button
          variant="destructive"
          className="h-24 px-8"
          disabled={!isConnected || !hasActivePosition || dockPending || dockConfirming}
          onClick={handleEmergencyDock}
        >
          {dockPending || dockConfirming ? "Closing…" : "Emergency close position"}
        </Button>
      </section>
    </PageFrame>
  );
}