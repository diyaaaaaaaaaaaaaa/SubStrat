const { ethers } = require("ethers");
const Aqua = require("./build/Aqua.json");
const MockERC20 = require("./build/MockERC20.json");
const StrategyController = require("./build/StrategyController.json");
const SubStratPermissions = require("./build/SubStratPermissions.json");

const RPC = "http://127.0.0.1:8545";
const ROLE_TUNER = 1n; // 1 << 0

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("  \u2713 " + msg);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const owner = await provider.getSigner(0);     // the "client"
  const strategist = await provider.getSigner(1);
  const ownerAddr = await owner.getAddress();
  const strategistAddr = await strategist.getAddress();

  console.log("\n== Deploy ==");
  const aquaFactory = new ethers.ContractFactory(Aqua.abi, Aqua.bytecode, owner);
  const aqua = await aquaFactory.deploy();
  await aqua.waitForDeployment();

  const erc20Factory = new ethers.ContractFactory(MockERC20.abi, MockERC20.bytecode, owner);
  const token0 = await erc20Factory.deploy("Token0", "TK0");
  const token1 = await erc20Factory.deploy("Token1", "TK1");
  await token0.waitForDeployment();
  await token1.waitForDeployment();

  // Real ENSv2 Enhanced Access Control, deployed as our own instance for now.
  const permsFactory = new ethers.ContractFactory(
    SubStratPermissions.abi,
    SubStratPermissions.bytecode,
    owner
  );
  const perms = await permsFactory.deploy(ownerAddr); // owner = ROLE_TUNER_ADMIN holder
  await perms.waitForDeployment();
  const permsAddr = await perms.getAddress();
  console.log("  SubStratPermissions deployed at", permsAddr);

  // Compute the mandate's resource exactly as the real Permissioned Resolver would for a
  // specific text key on a specific name: resource = keccak256(node, part).
  const node = ethers.namehash("client47.substrat.eth");
  const part = ethers.keccak256(ethers.toUtf8Bytes("substrat.tuner"));
  const mandateResource = await perms.resourceFor(node, part);
  console.log("  Mandate ENS name (placeholder): client47.substrat.eth");
  console.log("  Mandate resource:", mandateResource.toString());

  const appPlaceholder = strategistAddr; // unused by ship/dock, see Spike 1 notes
  const controllerFactory = new ethers.ContractFactory(
    StrategyController.abi,
    StrategyController.bytecode,
    owner
  );
  const controller = await controllerFactory.deploy(
    await aqua.getAddress(),
    appPlaceholder,
    permsAddr,
    mandateResource,
    ownerAddr
  );
  await controller.waitForDeployment();
  const controllerAddr = await controller.getAddress();
  console.log("  StrategyController deployed at", controllerAddr);

  console.log("\n== Fund & ship initial position (unchanged from Spike 1) ==");
  await (await token0.mint(controllerAddr, 10_000n)).wait();
  await (await token1.mint(controllerAddr, 10_000n)).wait();
  await (await controller.connect(owner).approveAqua(await token0.getAddress(), 10_000n)).wait();
  await (await controller.connect(owner).approveAqua(await token1.getAddress(), 10_000n)).wait();

  const tokens = [await token0.getAddress(), await token1.getAddress()];
  const strategyDataV1 = ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["range:100-200"]);
  await (await controller.connect(owner).shipInitial(strategyDataV1, tokens, [1000n, 2000n])).wait();
  assert((await controller.currentStrategyHash()) !== ethers.ZeroHash, "initial position shipped");

  console.log("\n== Strategist tries to rebalance BEFORE being granted the ENS role ==");
  let blockedBeforeGrant = false;
  try {
    await (
      await controller
        .connect(strategist)
        .rebalance(ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["attempt-before-grant"]), [1n, 1n])
    ).wait();
  } catch (e) {
    blockedBeforeGrant = true;
  }
  assert(blockedBeforeGrant, "rebalance correctly blocked with no ENS role granted yet");

  console.log("\n== Client grants the Tuner role via real ENSv2 Enhanced Access Control ==");
  assert(
    !(await perms.hasRoles(mandateResource, ROLE_TUNER, strategistAddr)),
    "role absent before grant (sanity check)"
  );
  await (await perms.connect(owner).grantRoles(mandateResource, ROLE_TUNER, strategistAddr)).wait();
  assert(
    await perms.hasRoles(mandateResource, ROLE_TUNER, strategistAddr),
    "ENS role now held by the strategist, on-chain"
  );

  console.log("\n== Strategist rebalances -- now authorized ==");
  const rebalanceCalldata = ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["range:150-250"]);
  const hashBefore = await controller.currentStrategyHash();
  await (await controller.connect(strategist).rebalance(rebalanceCalldata, [1500n, 2500n])).wait();
  const hashAfterGrant = await controller.currentStrategyHash();
  assert(hashAfterGrant !== hashBefore, "rebalance succeeded with the ENS role held (new strategy hash)");

  console.log("\n== THE DEMO BEAT: client revokes the role, live, on-chain ==");
  await (await perms.connect(owner).revokeRoles(mandateResource, ROLE_TUNER, strategistAddr)).wait();
  assert(
    !(await perms.hasRoles(mandateResource, ROLE_TUNER, strategistAddr)),
    "ENS role revoked -- confirmed gone on-chain"
  );

  console.log("\n== Strategist retries the SAME rebalance call that worked a moment ago ==");
  let blockedAfterRevoke = false;
  try {
    await (
      await controller
        .connect(strategist)
        .rebalance(
          ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["range:999-999"]),
          [1n, 1n]
        )
    ).wait();
  } catch (e) {
    blockedAfterRevoke = true;
  }
  assert(
    blockedAfterRevoke,
    "rebalance now fails -- no code change, no cooperation from the strategist, just the revoked ENS role"
  );

  console.log("\n== Owner emergency dock still works, unaffected by any of this ==");
  await (await controller.connect(owner).emergencyDock()).wait();
  assert((await controller.currentStrategyHash()) === ethers.ZeroHash, "owner retains full control throughout");

  console.log("\nSPIKE 2: PASSED. The rebalance gate is now a real ENSv2 Enhanced Access");
  console.log("Control role check, not a hardcoded address. Revocation is instant, on-chain,");
  console.log("and needs no cooperation from the strategist or any app.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
