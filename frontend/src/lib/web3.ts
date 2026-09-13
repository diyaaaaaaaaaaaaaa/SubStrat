import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { encodeAbiParameters } from "viem";

// ---------------------------------------------------------------------------
// Deployed contract addresses & mandate constants.
//
// Source of truth: /deployed_addresses.json at the project root (written by
// deploy_sepolia.js). Keep these in sync if the stack is ever redeployed --
// this file duplicates the values rather than importing the JSON because the
// frontend package root doesn't currently resolve paths outside `frontend/`.
// ---------------------------------------------------------------------------
export const CONTRACTS = {
  aqua: "0xBf5b6E65a930589159b78F34B6Cdc820Ff809BdF",
  app: "0xdC67f40c28A73762e0DffB582254183EfF0f8540",
  token0: "0xA9F430492ce6b8DE1162bBa23Db9A2921961C00C",
  token1: "0x882F022fca65e3196F4f96F32d0Dc46a32aad00B",
  controller: "0xA8309342b3918432eB9e4CF7ed5F274DDcf72930",
  resolver: "0x54481bf0aD37f63c1aA9E564eCAb72FCEC5A8C7b",
} as const;

export const CLIENT_ADDRESS = "0xa3F0c249358b5060B9Be971645e57E487E36601a" as const;
export const ENS_NAME = "prachicccy.eth";

// keccak256(node, part) for (namehash(ENS_NAME), keccak256("substrat.tuner")) --
// same formula proven in Spike 2's tests and used live by sepolia_wire.js.
export const MANDATE_RESOURCE =
  71753273788185224785967372301974439852156737312258433559413852178432066716789n;

// The text key the mandate's Tuner role is scoped to on the real Permissioned
// Resolver -- must match what sepolia_wire.js granted with.
export const MANDATE_TEXT_KEY = "substrat.tuner";

// PermissionedResolverLib.ROLE_SET_TEXT = 1 << 4 (confirmed against real
// ensdomains/contracts-v2 source -- NOT bit 0, see decision log D31/D32).
export const ROLE_SET_TEXT = 16n;

// The address granted the Tuner role live via sepolia_wire.js. There is no
// on-chain way to enumerate role holders (IEnhancedAccessControl only exposes
// hasRoles(resource, roles, account) for an address you already have, plus
// assignee *counts* -- never the addresses themselves), so this has to be a
// known constant rather than something the UI can discover on its own. If the
// role is ever re-granted to a different address, this must be updated by hand.
export const STRATEGIST_ADDRESS = "0x275ADA8BC782FDEa9dDAa2EFe2FEC31A5C3c639F" as const;

// The price band from the real, live shipInitial call in deploy_sepolia.js
// (minPrice 1.9, maxPrice 2.1, 18-decimal fixed point). No rebalance() has
// been sent against the live deployment since, so this is the actual current
// band, not a placeholder -- see decision log D51/D55 for why this is a
// labeled known value instead of decoded from calldata.
export const KNOWN_PRICE_BAND = { min: "1.9", max: "2.1" } as const;

// ---------------------------------------------------------------------------
// DNS wire-format encoding for ENS names, as required by authorizeTextRoles'
// `toName` parameter (PermissionedResolver.sol takes DNS-encoded bytes, not a
// plain string or bytes32 node -- see decision log D31).
//
// Implemented locally rather than imported: viem does not have a confirmed
// public `dnsEncode` export equivalent to ethers v6's `ethers.dnsEncode`, so
// rather than guess at an import path, this reproduces the standard RFC 1035
// wire format directly -- each label prefixed by its length byte, terminated
// by a zero-length byte. This is the same algorithm sepolia_wire.js already
// proved live via ethers.dnsEncode; the byte output is identical by
// definition of the format, not by assumption.
// ---------------------------------------------------------------------------
export function dnsEncodeName(name: string): `0x${string}` {
  const labels = name.split(".").filter(Boolean);
  const bytes: number[] = [];
  for (const label of labels) {
    const labelBytes = new TextEncoder().encode(label);
    if (labelBytes.length === 0 || labelBytes.length > 63) {
      throw new Error(`Invalid DNS label in "${name}": "${label}"`);
    }
    bytes.push(labelBytes.length, ...labelBytes);
  }
  bytes.push(0);
  return `0x${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

// ---------------------------------------------------------------------------
// Strategy struct encoding -- matches deploy_sepolia.js's `encodeStrategy`
// exactly: `tuple(address maker,address token0,address token1,uint256 minPrice,uint256 maxPrice)`,
// abi-encoded as a single tuple (no function selector). Used by both
// shipInitial and rebalance's opaque `bytes` strategy-data parameter.
// ---------------------------------------------------------------------------
export function encodeStrategyData(params: {
  maker: `0x${string}`;
  token0: `0x${string}`;
  token1: `0x${string}`;
  minPrice: bigint;
  maxPrice: bigint;
}): `0x${string}` {
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "maker", type: "address" },
          { name: "token0", type: "address" },
          { name: "token1", type: "address" },
          { name: "minPrice", type: "uint256" },
          { name: "maxPrice", type: "uint256" },
        ],
      },
    ],
    [params],
  );
}
export const erc20Abi = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ---------------------------------------------------------------------------
// wagmi config -- Sepolia only, this project never touches mainnet.
// ---------------------------------------------------------------------------
export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: { [sepolia.id]: http() },
  ssr: true,
});

// ---------------------------------------------------------------------------
// StrategyController ABI -- copied verbatim from build/StrategyController.json
// (the real compiled artifact), not hand-written. This replaces the fictional
// `mandates(owner)` ABI that was here before; that function doesn't exist on
// the real contract.
// ---------------------------------------------------------------------------
export const controllerAbi = [
  {
    inputs: [
      { internalType: "contract IAqua", name: "aqua_", type: "address" },
      { internalType: "address", name: "app_", type: "address" },
      { internalType: "contract IEnhancedAccessControl", name: "permissions_", type: "address" },
      { internalType: "uint256", name: "mandateResource_", type: "uint256" },
      { internalType: "address", name: "owner_", type: "address" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  { inputs: [], name: "NoActivePosition", type: "error" },
  {
    inputs: [{ internalType: "address", name: "caller", type: "address" }],
    name: "NotAuthorizedTuner",
    type: "error",
  },
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "OwnableInvalidOwner",
    type: "error",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "OwnableUnauthorizedAccount",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [{ indexed: false, internalType: "bytes32", name: "strategyHash", type: "bytes32" }],
    name: "EmergencyDocked",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "previousOwner", type: "address" },
      { indexed: true, internalType: "address", name: "newOwner", type: "address" },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "bytes32", name: "strategyHash", type: "bytes32" },
      { indexed: false, internalType: "address[]", name: "tokens", type: "address[]" },
      { indexed: false, internalType: "uint256[]", name: "amounts", type: "uint256[]" },
    ],
    name: "PositionOpened",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "bytes32", name: "oldStrategyHash", type: "bytes32" },
      { indexed: false, internalType: "bytes32", name: "newStrategyHash", type: "bytes32" },
      { indexed: false, internalType: "uint256[]", name: "newAmounts", type: "uint256[]" },
    ],
    name: "Rebalanced",
    type: "event",
  },
  {
    inputs: [],
    name: "APP",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "AQUA",
    outputs: [{ internalType: "contract IAqua", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "MANDATE_RESOURCE",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "PERMISSIONS",
    outputs: [{ internalType: "contract IEnhancedAccessControl", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approveAqua",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "currentStrategyHash",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "currentTokens",
    outputs: [{ internalType: "address[]", name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "emergencyDock", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes", name: "newStrategyData", type: "bytes" },
      { internalType: "uint256[]", name: "newAmounts", type: "uint256[]" },
    ],
    name: "rebalance",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  { inputs: [], name: "renounceOwnership", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [
      { internalType: "bytes", name: "strategyData", type: "bytes" },
      { internalType: "address[]", name: "tokens", type: "address[]" },
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" },
    ],
    name: "shipInitial",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "newOwner", type: "address" }],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// ---------------------------------------------------------------------------
// Minimal Permissioned Resolver ABI -- only the two functions the UI needs
// (mirrors the hand-written ABI already proven live by sepolia_wire.js; no
// need to compile the full real resolver just to call it from the frontend).
// ---------------------------------------------------------------------------
export const resolverAbi = [
  {
    inputs: [
      { internalType: "uint256", name: "resource", type: "uint256" },
      { internalType: "uint256", name: "roleBitmap", type: "uint256" },
      { internalType: "address", name: "account", type: "address" },
    ],
    name: "hasRoles",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes", name: "toName", type: "bytes" },
      { internalType: "string", name: "key", type: "string" },
      { internalType: "address", name: "account", type: "address" },
      { internalType: "bool", name: "grant", type: "bool" },
    ],
    name: "authorizeTextRoles",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;