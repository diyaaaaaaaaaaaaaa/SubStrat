require("dotenv").config();
const { ethers } = require("ethers");
const Aqua = require("./build/Aqua.json");
const MockERC20 = require("./build/MockERC20.json");
const StrategyController = require("./build/StrategyController.json");
const SubStratMandateApp = require("./build/SubStratMandateApp.json");

const ROLE_SET_TEXT = 16n; // 1 << 4 -- the real ENSv2 Permissioned Resolver's text-role bit
const STRATEGY_TUPLE = "tuple(address maker,address token0,address token1,uint256 minPrice,uint256 maxPrice)";
const TEXT_KEY = "substrat.tuner";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name} in your .env file.`);
    process.exit(1);
  }
  return v;
}

function encodeStrategy(s) {
  return ethers.AbiCoder.defaultAbiCoder().encode([STRATEGY_TUPLE], [s]);
}

async function main() {
  const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const clientKey = requireEnv("CLIENT_PRIVATE_KEY");
  const ensName = requireEnv("ENS_NAME");
  const resolverAddr = requireEnv("RESOLVER_ADDRESS");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const client = new ethers.Wallet(clientKey, provider);
  const clientAddr = await client.getAddress();
  console.log("Deploying as:", clientAddr);

  const node = ethers.namehash(ensName);
  const part = ethers.keccak256(ethers.toUtf8Bytes(TEXT_KEY));
  const mandateResource = BigInt(
    ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes32"], [node, part]))
  );
  console.log("Mandate resource (recomputed, not pasted):", mandateResource.toString());

  console.log("\n== 1. Deploy Aqua ==");
  const aqua = await new ethers.ContractFactory(Aqua.abi, Aqua.bytecode, client).deploy();
  await aqua.waitForDeployment();
  const aquaAddr = await aqua.getAddress();
  console.log("  Aqua:", aquaAddr);

  console.log("\n== 2. Deploy SubStratMandateApp ==");
  const app = await new ethers.ContractFactory(SubStratMandateApp.abi, SubStratMandateApp.bytecode, client).deploy(
    aquaAddr
  );
  await app.waitForDeployment();
  const appAddr = await app.getAddress();
  console.log("  SubStratMandateApp:", appAddr);

  console.log("\n== 3. Deploy two MockERC20 tokens ==");
  const token0 = await new ethers.ContractFactory(MockERC20.abi, MockERC20.bytecode, client).deploy(
    "SubStrat Token A",
    "SSTA"
  );
  const token1 = await new ethers.ContractFactory(MockERC20.abi, MockERC20.bytecode, client).deploy(
    "SubStrat Token B",
    "SSTB"
  );
  await token0.waitForDeployment();
  await token1.waitForDeployment();
  const token0Addr = await token0.getAddress();
  const token1Addr = await token1.getAddress();
  console.log("  token0 (SSTA):", token0Addr);
  console.log("  token1 (SSTB):", token1Addr);

  console.log("\n== 4. Deploy StrategyController, pointed at the REAL resolver ==");
  const controller = await new ethers.ContractFactory(
    StrategyController.abi,
    StrategyController.bytecode,
    client
  ).deploy(aquaAddr, appAddr, resolverAddr, mandateResource, clientAddr);
  await controller.waitForDeployment();
  const controllerAddr = await controller.getAddress();
  console.log("  StrategyController:", controllerAddr);

  console.log("\n== 5. Fund the controller and approve Aqua ==");
  const ONE = 10n ** 18n;
  const amount0 = 100_000n * ONE;
  const amount1 = 200_000n * ONE; // 2:1 ratio, matching the price band below

  await (await token0.mint(controllerAddr, amount0)).wait();
  await (await token1.mint(controllerAddr, amount1)).wait();
  await (await controller.approveAqua(token0Addr, amount0)).wait();
  await (await controller.approveAqua(token1Addr, amount1)).wait();
  console.log("  minted and approved.");

  console.log("\n== 6. Ship the initial mandate (price band [1.9, 2.1]) ==");
  const strategy = {
    maker: controllerAddr,
    token0: token0Addr,
    token1: token1Addr,
    minPrice: (19n * ONE) / 10n,
    maxPrice: (21n * ONE) / 10n,
  };
  await (
    await controller.shipInitial(encodeStrategy(strategy), [token0Addr, token1Addr], [amount0, amount1])
  ).wait();
  const strategyHash = await controller.currentStrategyHash();
  console.log("  shipped. strategyHash:", strategyHash);

  console.log("\n=== DEPLOYED ADDRESSES (save these for the frontend) ===");
  console.log(
    JSON.stringify(
      {
        network: "sepolia",
        aqua: aquaAddr,
        app: appAddr,
        token0: token0Addr,
        token1: token1Addr,
        controller: controllerAddr,
        resolver: resolverAddr,
        mandateResource: mandateResource.toString(),
        ensName,
        clientAddress: clientAddr,
        strategyHash,
      },
      null,
      2
    )
  );

  console.log(
    "\nNote: the client here does NOT yet hold the Tuner role themselves -- that role\n" +
      "belongs to whichever address you granted via sepolia_wire.js. rebalance() will\n" +
      "only work from that address until you grant/revoke differently."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});