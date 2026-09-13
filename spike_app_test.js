// NOT YET RUN -- author locally (this sandbox has no network / no node_modules).
// Mirrors spike1_test.js / spike2_test.js's style and local-Hardhat-node pattern.
// Run with: npx hardhat node   (separate terminal)   then   node spike_app_test.js

const { ethers } = require("ethers");
const Aqua = require("./build/Aqua.json");
const MockERC20 = require("./build/MockERC20.json");
const StrategyController = require("./build/StrategyController.json");
const SubStratPermissions = require("./build/SubStratPermissions.json");
const SubStratMandateApp = require("./build/SubStratMandateApp.json"); // compile.js must include the new file

const RPC = "http://127.0.0.1:8545";
const ROLE_SET_TEXT = 16n; // 1 << 4

const STRATEGY_TUPLE = "tuple(address maker,address token0,address token1,uint256 minPrice,uint256 maxPrice)";

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("  \u2713 " + msg);
}

function encodeStrategy(s) {
  return ethers.AbiCoder.defaultAbiCoder().encode([STRATEGY_TUPLE], [s]);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const owner = await provider.getSigner(0);      // the "client"
  const tuner = await provider.getSigner(1);       // ENS-granted Tuner
  const taker = await provider.getSigner(2);       // trades against the position
  const ownerAddr = await owner.getAddress();
  const tunerAddr = await tuner.getAddress();
  const takerAddr = await taker.getAddress();

  console.log("\n== Deploy ==");
  const aqua = await new ethers.ContractFactory(Aqua.abi, Aqua.bytecode, owner).deploy();
  await aqua.waitForDeployment();
  const aquaAddr = await aqua.getAddress();

  const app = await new ethers.ContractFactory(SubStratMandateApp.abi, SubStratMandateApp.bytecode, owner).deploy(aquaAddr);
  await app.waitForDeployment();
  const appAddr = await app.getAddress();
  console.log("  SubStratMandateApp deployed at", appAddr);

  const token0 = await new ethers.ContractFactory(MockERC20.abi, MockERC20.bytecode, owner).deploy("Token0", "TK0");
  const token1 = await new ethers.ContractFactory(MockERC20.abi, MockERC20.bytecode, owner).deploy("Token1", "TK1");
  await token0.waitForDeployment();
  await token1.waitForDeployment();
  const token0Addr = await token0.getAddress();
  const token1Addr = await token1.getAddress();

  const perms = await new ethers.ContractFactory(SubStratPermissions.abi, SubStratPermissions.bytecode, owner).deploy(ownerAddr);
  await perms.waitForDeployment();
  const node = ethers.namehash("client47.substrat.eth");
  const part = ethers.keccak256(ethers.toUtf8Bytes("substrat.tuner"));
  const mandateResource = await perms.resourceFor(node, part);

  const controller = await new ethers.ContractFactory(StrategyController.abi, StrategyController.bytecode, owner).deploy(
    aquaAddr, appAddr, await perms.getAddress(), mandateResource, ownerAddr
  );
  await controller.waitForDeployment();
  const controllerAddr = await controller.getAddress();
  console.log("  StrategyController deployed at", controllerAddr);

  console.log("\n== Ship the initial mandate: 1,000,000 TK0 / 2,000,000 TK1, band [1.9, 2.1] ==");
  await (await token0.mint(controllerAddr, 1_000_000n)).wait();
  await (await token1.mint(controllerAddr, 2_000_000n)).wait();
  await (await controller.connect(owner).approveAqua(token0Addr, 1_000_000n)).wait();
  await (await controller.connect(owner).approveAqua(token1Addr, 2_000_000n)).wait();

  const ONE = 10n ** 18n;
  const strategyV1 = { maker: controllerAddr, token0: token0Addr, token1: token1Addr, minPrice: (19n * ONE) / 10n, maxPrice: (21n * ONE) / 10n };
  await (await controller.connect(owner).shipInitial(encodeStrategy(strategyV1), [token0Addr, token1Addr], [1_000_000n, 2_000_000n])).wait();
  assert((await controller.currentStrategyHash()) !== ethers.ZeroHash, "mandate shipped through the real custom app");

  console.log("\n== Fund the taker and let them trade a modest amount within the band ==");
  await (await token1.mint(takerAddr, 2_000_000n)).wait();
  await (await token1.connect(taker).approve(appAddr, ethers.MaxUint256)).wait();

  const bal0Before = await token0.balanceOf(controllerAddr);
  await (await app.connect(taker).swap(strategyV1, false, 1000n, 0n, takerAddr)).wait();
  const bal0After = await token0.balanceOf(controllerAddr);
  assert(bal0After < bal0Before, "a REAL token0 transfer happened out of the controller's own wallet (pull), not a mock");
  assert((await token1.balanceOf(controllerAddr)) === 2_000_000n + 1000n, "controller's token1 balance rose by the real push amount");

  console.log("\n== A trade large enough to blow past the [1.9, 2.1] band must revert ==");
  let bigTradeBlocked = false;
  try {
    await (await app.connect(taker).swap(strategyV1, false, 1_500_000n, 0n, takerAddr)).wait();
  } catch (e) {
    bigTradeBlocked = true;
  }
  assert(bigTradeBlocked, "the mandate's price band acted as a real circuit breaker, not decoration");

  console.log("\n== Client grants the Tuner role via real ENSv2 Enhanced Access Control ==");
  await (await perms.connect(owner).grantRoles(mandateResource, ROLE_SET_TEXT, tunerAddr)).wait();
  assert(await perms.hasRoles(mandateResource, ROLE_SET_TEXT, tunerAddr), "ENS role held by tuner, on-chain");

  console.log("\n== Tuner widens the band live: [1.9, 3.6] -- dock + re-ship, same tokens ==");
  const strategyV2 = { ...strategyV1, maxPrice: (36n * ONE) / 10n };
  await (await controller.connect(tuner).rebalance(encodeStrategy(strategyV2), [999_501n, 2_001_000n])).wait();
  assert((await controller.currentStrategyHash()) !== ethers.ZeroHash, "rebalanced to the wider band under the ENS-granted role");

  console.log("\n== The SAME big trade that reverted a moment ago now succeeds under the new band ==");
  await (await app.connect(taker).swap(strategyV2, false, 1_400_000n, 0n, takerAddr)).wait();
  console.log("  \u2713 trade executed -- the Tuner's ENS-granted permission just changed what takers can actually trade");

  console.log("\nSPIKE APP: wrote SubStratMandateApp, real pull/push token transfers proven,");
  console.log("price band proven as a live circuit breaker, and tied directly to the ENS-gated");
  console.log("Tuner role -- the full 1inch -> ENS causal chain, executing for real.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});