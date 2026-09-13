// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IAqua } from "./aqua/interfaces/IAqua.sol";
import { IEnhancedAccessControl } from "./ens/access-control/interfaces/IEnhancedAccessControl.sol";
import { SubStratRoles } from "./SubStratRoles.sol";

/// @title StrategyController
/// @notice Client-owned contract that IS the Aqua "maker" for one delegated position.
///         The client (owner) never loses custody: only owner-only functions can move
///         funds out. Whoever holds the "Tuner" role on this mandate's ENS resource can
///         call `rebalance`, which is bounded to dock + re-ship the same tokens with new
///         params -- never a withdrawal. Revoking that role (on the ENS side, independent
///         of this contract) kills their access immediately -- no code change, no
///         cooperation from anyone needed.
contract StrategyController is Ownable {
    IAqua public immutable AQUA;
    address public immutable APP;
    IEnhancedAccessControl public immutable PERMISSIONS;
    uint256 public immutable MANDATE_RESOURCE;

    bytes32 public currentStrategyHash;
    address[] private _currentTokens;

    event PositionOpened(bytes32 strategyHash, address[] tokens, uint256[] amounts);
    event Rebalanced(bytes32 oldStrategyHash, bytes32 newStrategyHash, uint256[] newAmounts);
    event EmergencyDocked(bytes32 strategyHash);

    error NotAuthorizedTuner(address caller);
    error NoActivePosition();

    constructor(
        IAqua aqua_,
        address app_,
        IEnhancedAccessControl permissions_,
        uint256 mandateResource_,
        address owner_
    ) Ownable(owner_) {
        AQUA = aqua_;
        APP = app_;
        PERMISSIONS = permissions_;
        MANDATE_RESOURCE = mandateResource_;
    }

    /// @notice Owner-only: approve Aqua to move this controller's tokens.
    ///         The controller is the maker, so it approves Aqua directly --
    ///         no third party (including the strategist) ever holds these tokens.
    function approveAqua(address token, uint256 amount) external onlyOwner {
        IERC20(token).approve(address(AQUA), amount);
    }

    /// @notice Owner-only: open the initial position. Controller must already hold
    ///         (or have approved) the token balances being shipped.
    function shipInitial(
        bytes calldata strategyData,
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external onlyOwner {
        bytes32 strategyHash = AQUA.ship(APP, strategyData, tokens, amounts);
        currentStrategyHash = strategyHash;
        _currentTokens = tokens;
        emit PositionOpened(strategyHash, tokens, amounts);
    }

    /// @notice Whoever currently holds the "Tuner" role on this mandate's ENS resource may
    ///         adjust the position's parameters within whatever bounds `newStrategyData`/
    ///         `newAmounts` are validated against off-chain today. Real mechanism: Aqua
    ///         strategies are immutable once shipped, so "tuning" is dock() the current
    ///         strategy, then ship() a new one with the same token set. No token custody
    ///         ever moves outside this controller, and this check is read fresh from
    ///         `PERMISSIONS` on every call -- a revocation takes effect on the very next
    ///         transaction, with nothing here needing to be told about it.
    function rebalance(bytes calldata newStrategyData, uint256[] calldata newAmounts) external {
        if (!PERMISSIONS.hasRoles(MANDATE_RESOURCE, SubStratRoles.ROLE_SET_TEXT, msg.sender)) {
            revert NotAuthorizedTuner(msg.sender);
        }
        if (currentStrategyHash == bytes32(0)) {
            revert NoActivePosition();
        }

        bytes32 oldHash = currentStrategyHash;
        AQUA.dock(APP, oldHash, _currentTokens);

        bytes32 newHash = AQUA.ship(APP, newStrategyData, _currentTokens, newAmounts);
        currentStrategyHash = newHash;

        emit Rebalanced(oldHash, newHash, newAmounts);
    }

    /// @notice Owner-only emergency exit: dock the current strategy regardless of
    ///         what the strategist thinks. This -- and only this -- is what should
    ///         eventually sit behind a Privy key-quorum for a shared/org owner.
    function emergencyDock() external onlyOwner {
        if (currentStrategyHash == bytes32(0)) {
            revert NoActivePosition();
        }
        AQUA.dock(APP, currentStrategyHash, _currentTokens);
        emit EmergencyDocked(currentStrategyHash);
        currentStrategyHash = bytes32(0);
    }

    function currentTokens() external view returns (address[] memory) {
        return _currentTokens;
    }
}
