# SubStrat 🎛️

Delegate strategy, never custody. See `/mnt/user-data/outputs` PRD and handoff prompt
for full context. This folder is Spike 1's working state.

## Status
- [x] Spike 1: Aqua ship/dock/re-ship mechanics + owner/strategist separation, proven
      against the real `1inch/aqua` contracts on a local chain.
- [ ] Spike 2: swap the placeholder `msg.sender == strategist` check in
      `StrategyController.rebalance()` for an on-chain ENSv2 Enhanced Access Control
      role read.
- [ ] Spike 3: Privy smart wallet as `owner`, key-quorum on `emergencyDock`/
      `reassignStrategist` for a shared/org client.

## Run it yourself
```
npm install
node compile.js          # compiles against contracts/aqua (real 1inch source, MIT/Aqua-Source-1.1 licensed)
npx hardhat node &        # local EVM
node spike1_test.js       # runs the spike and prints assertions
```

## Why a controller contract, not a raw wallet, is the Aqua "maker"
`Aqua.ship`/`Aqua.dock` key their accounting off `msg.sender` directly -- there's no
separate maker parameter. So delegation can't work by having the client's wallet
stay the maker while a controller relays calls; the controller itself has to hold
the approval and be the maker. That's confirmed against the real contract, not
assumed -- see `contracts/aqua/Aqua.sol` lines 40-61.
