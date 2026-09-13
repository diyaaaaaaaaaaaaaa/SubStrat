require("dotenv").config();
const { ethers } = require("ethers");

const ROLE_SET_TEXT = 16n; // 1 << 4 -- confirmed against ensdomains/contracts-v2's
                            // PermissionedResolverLib.sol, not guessed.

// Minimal hand-written ABI -- we only need these two functions from the real
// Permissioned Resolver, so there's no need to compile its full (heavy) source
// just to call it.
const RESOLVER_ABI = [
  "function authorizeTextRoles(bytes toName, string key, address account, bool grant) external returns (bool)",
  "function hasRoles(uint256 resource, uint256 roleBitmap, address account) external view returns (bool)",
];

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name} in your .env file -- see SEPOLIA_WALKTHROUGH.md step 4.`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const clientKey = requireEnv("CLIENT_PRIVATE_KEY");
  const strategistAddr = requireEnv("STRATEGIST_ADDRESS");
  const ensName = requireEnv("ENS_NAME");
  const resolverAddr = requireEnv("RESOLVER_ADDRESS");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const client = new ethers.Wallet(clientKey, provider);
  const clientAddr = await client.getAddress();

  console.log("Client (must be the name's admin):", clientAddr);
  console.log("Strategist to authorize:          ", strategistAddr);
  console.log("ENS name:                          ", ensName);
  console.log("Resolver:                          ", resolverAddr);

  const textKey = "substrat.tuner";
  const dnsEncodedName = ethers.dnsEncode(ensName);
  const node = ethers.namehash(ensName);
  const part = ethers.keccak256(ethers.toUtf8Bytes(textKey));
  const resource = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes32"], [node, part])
  );
  const mandateResource = BigInt(resource);

  console.log("\nComputed (same formula proven in Spike 2's local tests):");
  console.log("  node:            ", node);
  console.log("  part:            ", part);
  console.log("  mandateResource: ", mandateResource.toString());

  const resolver = new ethers.Contract(resolverAddr, RESOLVER_ABI, client);

  console.log("\nGranting ROLE_SET_TEXT on-chain, live, on Sepolia...");
  const tx = await resolver.authorizeTextRoles(dnsEncodedName, textKey, strategistAddr, true);
  const receipt = await tx.wait();
  console.log("  tx confirmed:", receipt.hash);

  const confirmed = await resolver.hasRoles(mandateResource, ROLE_SET_TEXT, strategistAddr);
  console.log("  hasRoles check (should be true):", confirmed);

  if (!confirmed) {
    console.error(
      "\nSomething's off -- the grant transaction succeeded but hasRoles reads false. " +
        "Don't proceed to redeploy until this says true. Most likely cause: your " +
        "wallet doesn't hold admin rights on this name's resolver yet (check " +
        "explorer.ens.dev to confirm you're the owner)."
    );
    process.exit(1);
  }

  console.log("\n=== Redeploy StrategyController with these constructor args ===");
  console.log("aqua_:              <your Aqua deployment address>");
  console.log("app_:               <your custom Aqua app address>");
  console.log("permissions_:      ", resolverAddr, " <-- the real resolver, not SubStratPermissions");
  console.log("mandateResource_:  ", mandateResource.toString());
  console.log("owner_:            ", clientAddr);
  console.log("\nNo other code changes needed -- StrategyController.rebalance() already");
  console.log("checks SubStratRoles.ROLE_SET_TEXT, which is the same bit this just granted.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
