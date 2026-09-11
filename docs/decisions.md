# SubStrat — Decision Log

Living document.

---

## Track & positioning decisions

**D1 — Dropped The Graph tracks entirely.**
Originally scoped a project around The Graph's Composable/Standardized + AI-From-Scratch tracks (an AI agent doing DeFi risk monitoring). Dropped after deciding not to build "the 100th AI agent that escalates to a human" — too common a hackathon pattern this cycle. Pivoted to sponsors the user wanted to genuinely explore: 1inch, ENS, Privy.

**D2 — Selected three tracks: 1inch (Build an Aqua App), ENS (Best Use of ENSv2), Privy (Best B2B Financial Product).**
Chosen over Arc/Hedera/Uniswap/Chainlink alternatives specifically because all three sit on the same stack without forking into a second chain or payment system — avoids scope creep from maintaining two blockchain integrations.

**D3 — Category tag for ETHGlobal submission form: "DeFi"** (secondary tag if allowed: "Wallet/Payments"). The core mechanism is a DeFi position; ENS/Privy are supporting trust layers, not the category itself.

**D4 — Rejected an earlier "liquidity mandate marketplace" concept** (ENS for naming/permissions, Privy for approvals, 1inch for execution as three parallel, swappable features) in favor of a design where the three sponsors form a causal chain — removing any one breaks the product, not just weakens it.

## Naming history

**D5 — Project name evolution:** "Substrategy" (working name during architecture design) → "Mandate" (proposed mid-conversation for a more generalist-friendly Finalist pitch; applied to the PRD without confirming first — user flagged this, correctly) → **"SubStrat"** (final, user-chosen, confirmed).

**D6 — Emoji: 🎛️** (control panel with bounded knobs — matches "strategist can turn specific dials, not open the whole panel"). Alternative considered: 🔐 (if leading with trust/custody framing instead).

## Core architecture decisions

**D7 — The causal chain the whole pitch rests on:**
```
1inch Aqua/SwapVM → what's delegated (a self-custodial position)
ENSv2              → who's allowed to touch it, proven/revoked on-chain
Privy              → where "tune" stops and "take" begins, enforced by policy
```

**D8 — `StrategyController` contract is the Aqua "maker" itself, not a relay for the client's wallet.**
Reason: confirmed directly from `1inch/aqua`'s `Aqua.sol` source that `ship()`/`dock()` key their accounting off `msg.sender` — there is no separate maker parameter passed in. A relay-style design (client wallet stays maker, controller just forwards calls) is architecturally impossible given this. The controller must hold its own token approval to Aqua and be the maker outright. This resolved what was flagged as "Open Risk #1" in the original PRD.

**D9 — Privy's role is client-side governance, not strategist-gating.**
The ENS on-chain role check gates the strategist, independent of Privy entirely — this is what makes revocation trustless (doesn't depend on Privy's centralized policy engine cooperating). Privy instead governs the *owner* side: who controls the controller's owner-only functions (`emergencyDock`, `reassignStrategist`) — a natural fit for Privy's key-quorum feature if the client is a shared/org treasury, or just seedless wallet UX for a solo client.

**D10 — MVP scope: one Aqua strategy type, one custom rebalance instruction; ENSv2 subname + Enhanced Access Control gate; Privy smart wallet + scoped signer/policy; three screens (client view, strategist panel, public audit view).**
Explicitly out of scope: multiple strategy/asset types, any AI/agent logic, mainnet deployment, a strategist marketplace UI.

## Fact-checks completed (don't re-verify these)

**D11 — Aqua strategies are genuinely immutable once shipped.** Confirmed against the `1inch/aqua` GitHub README and source directly. "Tuning" = `dock(strategyHash)` (accounting-only unwind, no token transfer) followed by `ship(newStrategy)` (fresh strategy, new params). This is the real mechanism, not a workaround.

**D12 — Privy's policy engine (owners, signers, scoped calldata/contract allowlists, transfer limits, key quorums) is a real, documented feature**, not a stretch — confirmed against docs.privy.io. This was the shakiest unverified assumption in the original plan and it holds.

**D13 — ENSv2 Enhanced Access Control is a genuine on-chain role-permission system** on registries and resolvers, not just resolver text-record metadata — meaning a smart contract can directly query "does address X hold role Y on this name" instead of trusting an off-chain-readable text blob. This is what answers "why does an ENS record control execution" credibly to a judge.

**D14 — Competitive landscape note:** two other Aqua-adjacent projects spotted during research — Sluice (ETHGlobal Lisbon 2026, natural-language Aqua strategy composer) and Breakwater (appears to be an active ETHOnline 2026 submission, DAO-treasury depeg guard on Aqua). Neither does scoped delegation/revocation, so SubStrat's angle remains distinct, but expect Aqua-literate judges this cycle.

## Build log

**D15 — Spike 1 goal:** prove the Aqua ship→dock→ship mechanic plus owner/strategist separation, against real 1inch contracts, before writing any ENS or Privy code (per the PRD's explicit build order — validate before building UI).

**D16 — Environment: Foundry's installer (`foundry.paradigm.xyz`) and direct GitHub release binaries were unreachable inside the build sandbox's network allowlist.** Pivoted to Hardhat + the `solc` npm package (which bundles the compiler binary inside the npm tarball itself, so it doesn't need to reach `binaries.soliditylang.org`). A standalone `compile.js` script handles compilation directly via `solc`, resolving imports from `node_modules` and local paths, bypassing Hardhat's own compiler downloader entirely (which would otherwise also try to reach the blocked domain).

**D17 — Bug found & fixed: `npm install --save-dev solc@0.8.30` recorded a caret range (`^0.8.30`) in `package.json` by default,** which let a later `npm install` pull `0.8.37` instead — incompatible with Aqua's exact `pragma solidity 0.8.30;` pins. Fix: pin the exact version with no caret in `package.json`.

**D18 — Bug found & fixed: `compile.js` built its source-file map using `path.relative()`,** which on Windows produces backslash-separated paths (`aqua\AquaApp.sol`). solc's internal import resolver only understands forward slashes, so relative imports inside nested folders (`./interfaces/IAqua.sol`) failed to resolve on Windows even though the same script worked fine on Linux. Fix: normalize every source key with `.split(path.sep).join("/")` before handing it to solc.

**D19 — Spike 1: PASSED**, both in the build sandbox and independently reproduced on the user's own Windows machine, after the two fixes above. Confirmed on-chain, against real `1inch/aqua` contracts:
- Controller holds its own Aqua approval; strategist never touches tokens.
- Unauthorized addresses cannot call `rebalance()`.
- Strategist rebalance produces a genuinely new strategy hash (old one sentinel-marked docked), matching Aqua's immutable-strategy design.
- Owner can force-close (`emergencyDock`) independent of the strategist.

## Open / upcoming

**D20 — Next: Spike 2.** Replace the placeholder `require(msg.sender == strategist)` check in `StrategyController.rebalance()` with an on-chain read of ENSv2 Enhanced Access Control role state for the client's subname. Not started yet.

**D21 — Still unresolved:** exact ENSv2 Sepolia contract addresses and Enhanced Access Control's precise interface — need to read the ENS Contract Developer tutorial before writing Spike 2's code, rather than guessing the shape.

**D22 — Still unresolved:** whether Privy's calldata-constraint policies can be scoped tightly enough in practice to matter for the demo, or whether Privy's role stays purely at the "owner-side key quorum" layer decided in D9. To be tested in Spike 3.

**D23 — Public repo live:** https://github.com/diyaaaaaaaaaaaaaa/SubStrat. First real incremental commits pushed (bug fixes to `compile.js`/`package.json`, then `.gitignore`) — satisfies 1inch's "no single-commit last-day entries" requirement starting from this point forward. PRD and this decision log are not yet committed into the repo itself (still only in chat output) — pending: add both under a `docs/` folder in a future commit.