const { ethers } = require("ethers");
const Aqua = require("./build/Aqua.json");
const MockERC20 = require("./build/MockERC20.json");
const StrategyController = require("./build/StrategyController.json");

const RPC = "http://127.0.0.1:8545";

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("  \u2713 " + msg);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const owner = await provider.getSigner(0);     // the "client"
  const strategist = await provider.getSigner(1);
  const rando = await provider.getSigner(2);      // unauthorized address
  const ownerAddr = await owner.getAddress();
  const strategistAddr = await strategist.getAddress();
  const randoAddr = await rando.getAddress();

  console.log("\n== Deploy ==");
  const aquaFactory = new ethers.ContractFactory(Aqua.abi, Aqua.bytecode, owner);
  const aqua = await aquaFactory.deploy();
  await aqua.waitForDeployment();
  console.log("  Aqua deployed at", await aqua.getAddress());

  const erc20Factory = new ethers.ContractFactory(MockERC20.abi, MockERC20.bytecode, owner);
  const token0 = await erc20Factory.deploy("Token0", "TK0");
  const token1 = await erc20Factory.deploy("Token1", "TK1");
  await token0.waitForDeployment();
  await token1.waitForDeployment();
  console.log("  token0:", await token0.getAddress());
  console.log("  token1:", await token1.getAddress());

  // Placeholder "app" address for this spike -- ship()/dock() never call into it,
  // they only use it as a mapping key, so a plain EOA-like address is fine here.
  // Spike 3 / the real 1inch submission replaces this with our custom Aqua app.
  const appPlaceholder = randoAddr;

  const controllerFactory = new ethers.ContractFactory(
    StrategyController.abi,
    StrategyController.bytecode,
    owner
  );
  const controller = await controllerFactory.deploy(
    await aqua.getAddress(),
    appPlaceholder,
    strategistAddr,
    ownerAddr
  );
  await controller.waitForDeployment();
  const controllerAddr = await controller.getAddress();
  console.log("  StrategyController deployed at", controllerAddr);

  console.log("\n== Fund controller & approve Aqua (owner-only) ==");
  await (await token0.mint(controllerAddr, 10_000n)).wait();
  await (await token1.mint(controllerAddr, 10_000n)).wait();
  await (await controller.connect(owner).approveAqua(await token0.getAddress(), 10_000n)).wait();
  await (await controller.connect(owner).approveAqua(await token1.getAddress(), 10_000n)).wait();
  assert(
    (await token0.allowance(controllerAddr, await aqua.getAddress())) === 10_000n,
    "controller approved Aqua to move token0 on its own behalf (self-custodial: controller, not strategist, holds this)"
  );

  console.log("\n== Ship initial position (owner-only) ==");
  const tokens = [await token0.getAddress(), await token1.getAddress()];
  const initialAmounts = [1000n, 2000n];
  const strategyDataV1 = ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["range:100-200"]);
  await (await controller.connect(owner).shipInitial(strategyDataV1, tokens, initialAmounts)).wait();

  const hashV1 = await controller.currentStrategyHash();
  console.log("  strategyHash v1:", hashV1);
  const [bal0V1, tokensCount0V1] = await aqua.rawBalances(controllerAddr, appPlaceholder, hashV1, tokens[0]);
  assert(bal0V1 === 1000n && tokensCount0V1 === 2n, "Aqua accounting shows token0 balance = 1000 under strategy v1");

  console.log("\n== Unauthorized rebalance attempt (must fail) ==");
  let randoFailed = false;
  try {
    await (
      await controller
        .connect(rando)
        .rebalance(ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["range:999-999"]), [1n, 1n])
    ).wait();
  } catch (e) {
    randoFailed = true;
  }
  assert(randoFailed, "a non-strategist address cannot call rebalance()");

  console.log("\n== Strategist rebalances within their (currently unscoped) authority ==");
  const strategyDataV2 = ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["range:150-250"]);
  const newAmounts = [1500n, 2500n];
  await (await controller.connect(strategist).rebalance(strategyDataV2, newAmounts)).wait();

  const hashV2 = await controller.currentStrategyHash();
  console.log("  strategyHash v2:", hashV2);
  assert(hashV2 !== hashV1, "rebalance produced a new strategy hash (v1 was immutable, as Aqua requires)");

  const [, tokensCountV1After] = await aqua.rawBalances(controllerAddr, appPlaceholder, hashV1, tokens[0]);
  assert(tokensCountV1After === 255n, "old strategy v1 is now DOCKED on-chain (tokensCount sentinel = 0xff)");

  const [bal0V2] = await aqua.rawBalances(controllerAddr, appPlaceholder, hashV2, tokens[0]);
  assert(bal0V2 === 1500n, "new strategy v2 is active with the updated amount (1500)");

  console.log("\n== Owner emergency dock (bypasses strategist entirely) ==");
  await (await controller.connect(owner).emergencyDock()).wait();
  assert((await controller.currentStrategyHash()) === ethers.ZeroHash, "owner can force-close the position independent of the strategist");

  console.log("\nSPIKE 1: PASSED. Aqua ship/dock/re-ship mechanics + owner/strategist");
  console.log("separation confirmed against the real 1inch/aqua contracts, locally deployed.");
  console.log("Next: Spike 2 replaces the `msg.sender == strategist` check with an");
  console.log("on-chain ENSv2 Enhanced Access Control role read.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
