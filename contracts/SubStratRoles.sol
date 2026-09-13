// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @dev Role bitmap constants for SubStrat's use of ENSv2's Enhanced Access Control.
///
///      ROLE_SET_TEXT is not an arbitrary bit we picked -- it is the EXACT role bit
///      the real ENSv2 Permissioned Resolver uses for "may set this text record"
///      (confirmed directly from `PermissionedResolverLib.sol`: `ROLE_SET_TEXT = 1 << 4`).
///      By reusing the same bit and the same `resource = keccak256(node, part)` formula
///      here, our local `SubStratPermissions` stand-in is bit-for-bit compatible with the
///      real resolver -- pointing `StrategyController` at a live Sepolia name's actual
///      resolver later requires changing only the contract address, not this constant.
library SubStratRoles {
    uint256 internal constant ROLE_SET_TEXT = 1 << 4;
    uint256 internal constant ROLE_SET_TEXT_ADMIN = ROLE_SET_TEXT << 128;
}
