// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { EnhancedAccessControl } from "./ens/access-control/EnhancedAccessControl.sol";
import { SubStratRoles } from "./SubStratRoles.sol";

/// @title SubStratPermissions
/// @notice A minimal concrete instance of ENSv2's real `EnhancedAccessControl` base contract.
///
/// @dev SPIKE 2 STATUS: this stands in for the client's actual ENSv2 Permissioned Resolver
///      until a later step points `StrategyController` at a real, live-registered ENS name
///      on Sepolia instead. That swap requires changing only the contract address this
///      controller reads from -- the resource-computation formula below is byte-identical
///      to how the real Permissioned Resolver scopes a role to one specific text record on
///      one specific name (see `resourceFor`), so nothing about the on-chain check changes.
///
///      This contract itself is not a mock of ENS's access control -- it *is* ENS's real
///      `EnhancedAccessControl.sol`, imported unmodified from `ensdomains/contracts-v2`,
///      with one concrete role defined on top (`ROLE_SET_TEXT`, matching the real ENSv2
///      contract (including the Permissioned Resolver) uses to define its own roles.
contract SubStratPermissions is EnhancedAccessControl {
    constructor(address admin) {
        // Mirrors exactly how ENSv2's own PermissionedResolver.initialize() bootstraps its
        // first admin: _grantRoles(ROOT_RESOURCE, roleBitmap, admin, false).
        _grantRoles(ROOT_RESOURCE, SubStratRoles.ROLE_SET_TEXT_ADMIN, admin, false);
    }

    /// @notice Computes an EAC resource exactly as ENSv2's Permissioned Resolver does for a
    ///         specific text record on a specific name: resource = keccak256(node, part).
    ///         `node` would be the name's namehash; `part` would be keccak256(bytes(textKey)).
    function resourceFor(bytes32 node, bytes32 part) external pure returns (uint256) {
        return uint256(keccak256(abi.encode(node, part)));
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
