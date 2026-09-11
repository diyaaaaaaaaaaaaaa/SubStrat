# SubStrat 🎛️ — Product Requirements Document
**ETHOnline 2026 | Tracks: 1inch (Aqua), ENS (ENSv2), Privy | Finalist submission**

---

## 1. One-liner

Let someone else manage part of your DeFi position, without ever giving them your money. The strategist can act, but can never take. And you can fire them yourself, instantly, with no one's cooperation.

## 2. Problem

Today, delegating investment/trading decisions on-chain means one of three bad options:
1. **Give them your wallet** — full custody risk.
2. **Use a black-box vault** — opaque logic, no visibility, hard to exit.
3. **Manage it yourself** — no delegation at all.

There's no clean middle ground: *narrow, scoped, revocable authority* over a live position, enforced by the chain itself rather than by trust in an app or a company.

## 3. Users

| Persona | Wants | Never wants |
|---|---|---|
| **Client** (DAO treasury, small fund, individual with capital) | A strategist to actively manage yield/range parameters | To risk principal, or depend on the strategist's app staying online to revoke them |
| **Strategist** (yield expert, market maker, advisor) | A reusable, publishable strategy others can adopt without them touching client funds | Custody liability, or having to build trust one relationship at a time |

## 4. Core mechanism (the causal chain)

```
1inch Aqua/SwapVM  → what's being delegated (a self-custodial position)
ENSv2               → who's allowed to touch it, and how that's proven/revoked on-chain
Privy               → where the boundary between "tune" and "take" is enforced
```

Remove any one piece and the product breaks:
- Without Aqua's self-custodial model, delegation = handing over a wallet.
- Without ENSv2, revocation depends on the strategist's or your own backend cooperating.
- Without Privy, there's no clean line between "adjust a parameter" and "move the money."

## 5. System architecture

**Actors**
- `Client` - Privy smart wallet (ERC-4337), acts as the Aqua "maker," holds token approvals. Never loses custody.
- `Strategist` - an address registered as a **Privy signer** on the client's wallet, scoped by policy.
- `StrategyController` - a thin wrapper contract the client's wallet approves as an Aqua maker-side helper. Exposes one function: `rebalance(strategyHash, newParams)`.

**On every rebalance call:**
```
Strategist calls StrategyController.rebalance(...)
  → StrategyController checks: does msg.sender hold the "Tuner" role
     on client47.<strategist>.eth via ENSv2 Enhanced Access Control?
  → if yes: calls Aqua.dock(strategyHash) then ships new strategy
    with updated params, within pre-approved bounds
  → if the role was revoked: reverts. No app, backend, or
    cooperation from either party required for this to hold.
```

**On any principal-touching action** (withdraw, close, reassign strategist):
```
Requires Privy owner-level authorization (client) or a key quorum 
the strategist's signer-level policy does not cover these calldata paths.
```

**ENSv2 layer**
- Parent namespace: `<strategist>.eth`, using a **Permissioned Registry** the strategist controls.
- Per-client subname: `client47.<strategist>.eth`, minted per new mandate, with wildcard resolution so clients don't need pre-registration.
- **Enhanced Access Control** grants the strategist address a scoped role (e.g. "Tuner") on that subname, checked on-chain by `StrategyController`, not just displayed.
- **Permissioned Resolver** on the subname stores mandate metadata (strategy type, bounds, status) as structured records.
- Revocation = client (or the parent registry owner, per config) removes the role. No relayer or backend needed.

## 6. User flows

**Flow A - Establish a mandate**
1. Client creates a Privy smart wallet, funds it, ships an initial Aqua strategy.
2. Client registers `client47.<strategist>.eth`, grants the strategist a "Tuner" role via Enhanced Access Control.
3. Client adds the strategist as a Privy signer with a policy scoped to `StrategyController.rebalance()` only, with parameter bounds.

**Flow B - Strategist tunes within bounds**
1. Strategist calls `rebalance()` with a new range/param set inside the approved bounds.
2. Contract confirms the ENS role is active → dock + re-ship executes.
3. UI reflects the updated position; ENS resolver record updates.

**Flow C - Blocked principal action (the "can't take" proof)**
1. Strategist attempts a withdrawal or a call outside their policy scope.
2. Privy policy engine rejects it before it reaches the chain — signer-level, not owner-level.

**Flow D - Live revocation (the demo moment)**
1. Client revokes the strategist's ENS role directly (or via the app, but framed as something the client alone controls).
2. Strategist immediately retries the *same* valid rebalance that worked a moment earlier.
3. Call reverts — the position keeps running, fully in the client's control, no one else's involvement needed.

## 7. Scope

**In scope (MVP)**
- One Aqua strategy type, one custom SwapVM instruction for the bounded rebalance.
- ENSv2 subname registry + Enhanced Access Control role check, on-chain, gating the wrapper contract.
- Privy smart wallet as maker; strategist as scoped signer with policy; owner/quorum gate for principal actions.
- Three-screen UI: client position view, strategist mandate panel, public read-only audit view (resolve the ENS name, see the mandate).


## 8. Sponsor qualification mapping

| Requirement | How this satisfies it |
|---|---|
| **1inch**  official Aqua/SwapVM contracts, custom opcode, on-chain execution, real commit history | Custom bounded-rebalance instruction; dock/ship shown live against canonical contracts; commits from day 1 |
| **ENSv2**  features central not cosmetic, functional demo | Enhanced Access Control role check is the actual execution gate, verified on-chain, not a text-record display |
| **Privy- B2B** | Org/client smart wallet, signer + policy control, real B2B workflow (delegated management with owner override) |
| **Privy- Financial flow** (stretch, if time allows) | The rebalance itself is a functional wallet action under policy, it's worth checking if this doubles up cleanly, or focus solely on B2B track to avoid spreading thin |

## 9. Build order (to be validated before building UI)

1. **Spike — Aqua**: ship one strategy, dock it, re-ship with new params from a Privy smart wallet. Confirm token flow / accounting.
2. **Spike — ENS gate**: `StrategyController` reads Enhanced Access Control role state on-chain and reverts correctly when absent.
3. **Spike — Privy policy**: confirm a scoped signer can call the wrapper but is blocked on any other calldata path; confirm owner/quorum override.
4. Only after all three hold → subname registration flow → UI → polish.

## 10. Open risks

- Confirm whether `StrategyController` needs to *be* the Aqua "maker" (i.e., holds the approvals itself) vs. acting on behalf of the client's wallet as maker — affects who can legally be the token-approval holder. Resolve in Spike 1.
- Confirm ENSv2 Sepolia contract addresses and Enhanced Access Control's exact interface via the Contract Developer tutorial before coding the gate.
- Privy calldata-constraint policies need to be scoped precisely enough to allow the bounded rebalance but nothing else and test this early, not on demo day.
