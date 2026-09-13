import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { Button } from "@/components/ui/button";
import { DataUnavailable, PageFrame } from "@/components/page-frame";
import {
  CONTRACTS,
  MANDATE_RESOURCE,
  ROLE_SET_TEXT,
  STRATEGIST_ADDRESS,
  controllerAbi,
  encodeStrategyData,
  erc20Abi,
  resolverAbi,
} from "@/lib/web3";

export const Route = createFileRoute("/mandate")({
  head: () => ({ meta: [
    { title: "Strategist Mandate — SubStrat" },
    { name: "description", content: "Inspect bounded permissions and propose a SubStrat rebalance." },
    { property: "og:title", content: "Strategist Mandate — SubStrat" },
    { property: "og:description", content: "Inspect bounded permissions and propose a SubStrat rebalance." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: Mandate,
});

function Mandate() {
  const { address, isConnected } = useAccount();
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const isStrategistWallet = !!address && address.toLowerCase() === STRATEGIST_ADDRESS.toLowerCase();

  const { data: isTunerActive, isLoading: roleLoading } = useReadContract({
    address: CONTRACTS.resolver,
    abi: resolverAbi,
    functionName: "hasRoles",
    args: [MANDATE_RESOURCE, ROLE_SET_TEXT, STRATEGIST_ADDRESS],
    query: { enabled: isConnected },
  });

  const { data: strategyHash } = useReadContract({
    address: CONTRACTS.controller,
    abi: controllerAbi,
    functionName: "currentStrategyHash",
    query: { enabled: isConnected },
  });
  const hasActivePosition = !!strategyHash && strategyHash !== ("0x" + "0".repeat(64));

  // Rebalance carries the same token amounts forward -- it changes the price
  // band, not the position size (matches the proven pattern in
  // spike_app_test.js's "Tuner widens the band live" step). These are the
  // controller's real, live balances, not placeholders.
  const { data: balances, isLoading: balancesLoading } = useReadContracts({
    contracts: [
      { address: CONTRACTS.token0, abi: erc20Abi, functionName: "balanceOf", args: [CONTRACTS.controller] },
      { address: CONTRACTS.token1, abi: erc20Abi, functionName: "balanceOf", args: [CONTRACTS.controller] },
      { address: CONTRACTS.token0, abi: erc20Abi, functionName: "symbol" },
      { address: CONTRACTS.token1, abi: erc20Abi, functionName: "symbol" },
    ],
    query: { enabled: isConnected },
  });
  const balancesReady = balances?.every((b) => b.status === "success") ?? false;

  const { writeContract: rebalance, data: rebalanceHash, isPending: rebalancePending } = useWriteContract();
  const { isLoading: rebalanceConfirming, isSuccess: rebalanceConfirmed } = useWaitForTransactionReceipt({ hash: rebalanceHash });

  const canSubmit = isConnected && isStrategistWallet && isTunerActive && hasActivePosition && balancesReady;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!minPrice || !maxPrice) {
      setFormError("Enter both a minimum and maximum price.");
      return;
    }
    let min: bigint, max: bigint;
    try {
      min = parseUnits(minPrice, 18);
      max = parseUnits(maxPrice, 18);
    } catch {
      setFormError("Prices must be plain decimal numbers, e.g. 1.9");
      return;
    }
    if (max <= min) {
      setFormError("Max price must be greater than min price.");
      return;
    }
    if (!balances) return;

    const newStrategyData = encodeStrategyData({
      maker: CONTRACTS.controller,
      token0: CONTRACTS.token0,
      token1: CONTRACTS.token1,
      minPrice: min,
      maxPrice: max,
    });
    rebalance({
      address: CONTRACTS.controller,
      abi: controllerAbi,
      functionName: "rebalance",
      args: [newStrategyData, [balances[0].result as bigint, balances[1].result as bigint]],
    });
  }

  const gateMessage = !isConnected
    ? "Connect the authorized strategist wallet to load the mandate parameters."
    : !isStrategistWallet
      ? `This wallet isn't the registered strategist (${STRATEGIST_ADDRESS}). Connect that wallet to propose a rebalance.`
      : roleLoading
        ? "Checking your Tuner role on-chain…"
        : !isTunerActive
          ? "Your Tuner role has been revoked on ENS. Rebalancing is no longer possible from this wallet."
          : !hasActivePosition
            ? "No active mandate to rebalance."
            : null;

  return (
    <PageFrame eyebrow="Bounded operator access / Sepolia" title="Mandate panel">
      {gateMessage && <DataUnavailable>{gateMessage}</DataUnavailable>}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="poster-panel bg-pink p-6">
          <p className="meta-label">Permitted controls</p>
          <h2 className="mt-3 font-display text-4xl uppercase">Scope, not custody</h2>
          <dl className="mt-8 divide-y-3 divide-ink border-y-3 border-ink">
            {[
              ["Pool", balancesReady ? `${balances![2].result} / ${balances![3].result}` : "—"],
              ["Position", balancesReady ? `${formatUnits(balances![0].result as bigint, 18)} / ${formatUnits(balances![1].result as bigint, 18)}` : "—"],
              ["Tuner role", isConnected ? (roleLoading ? "Loading…" : isTunerActive ? "Active" : "Revoked") : "—"],
              ["Can touch principal", "Never — see StrategyController.sol"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-4">
                <dt className="meta-label">{label}</dt>
                <dd className="font-mono text-sm">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <form className="poster-panel bg-offwhite p-6" onSubmit={handleSubmit}>
          <p className="meta-label">Authorized action</p>
          <h2 className="mt-3 font-display text-4xl uppercase">Propose rebalance</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            <label className="meta-label">
              Min price
              <input
                type="text"
                inputMode="decimal"
                disabled={!canSubmit}
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="mt-2 h-12 w-full border-3 border-ink bg-offwhite px-3 font-mono text-base tracking-normal outline-none focus:ring-4 focus:ring-ring"
                placeholder="1.9"
              />
            </label>
            <label className="meta-label">
              Max price
              <input
                type="text"
                inputMode="decimal"
                disabled={!canSubmit}
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="mt-2 h-12 w-full border-3 border-ink bg-offwhite px-3 font-mono text-base tracking-normal outline-none focus:ring-4 focus:ring-ring"
                placeholder="2.1"
              />
            </label>
          </div>
          {formError && <p className="mt-3 text-sm text-destructive">{formError}</p>}
          <Button type="submit" variant="poster" size="lg" className="mt-8 w-full" disabled={!canSubmit || rebalancePending || rebalanceConfirming}>
            {rebalancePending || rebalanceConfirming ? "Submitting…" : rebalanceConfirmed ? "Rebalanced ✓" : "Submit proposal"}
          </Button>
        </form>
      </div>
      <section className="poster-panel mt-6 bg-offwhite p-5">
        <p className="meta-label">Mandate state</p>
        <p className="mt-2">
          {hasActivePosition
            ? "Rebalancing docks the current strategy and re-ships a new one with the same token amounts, within the price band you set above. Token amounts never change here — only the price band does."
            : "No active mandate is available for this wallet. Controls remain unavailable."}
        </p>
      </section>
    </PageFrame>
  );
}