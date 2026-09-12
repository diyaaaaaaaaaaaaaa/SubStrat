// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @dev Role bitmap constants for SubStrat's use of ENSv2's Enhanced Access Control.
///      Follows the exact same bitmap convention ENSv2's own contracts use (regular role
///      at bit N, its admin counterpart at bit N+128) so this is a drop-in match for the
///      real Permissioned Resolver's role layout, not a bespoke scheme.
library SubStratRoles {
    uint256 internal constant ROLE_TUNER = 1 << 0;
    uint256 internal constant ROLE_TUNER_ADMIN = ROLE_TUNER << 128;
}
