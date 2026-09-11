// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IAqua } from "./aqua/interfaces/IAqua.sol";

/// @title StrategyController
/// @notice Client-owned contract that IS the Aqua "maker" for one delegated position.
///         The client (owner) never loses custody: only owner-only functions can move
///         funds out. The strategist can only call `rebalance`, which is bounded to
///         dock + re-ship the same tokens with new params -- never a withdrawal.
///
/// @dev SPIKE 1 STATUS: strategist gating is a plain `require(msg.sender == strategist)`.
///      This is the placeholder that Spike 2 replaces with an on-chain ENSv2 Enhanced
///      Access Control role check (see TODO below). Everything else here -- the Aqua
///      ship/dock/re-ship mechanics -- is the real, final mechanism.
contract StrategyController is Ownable {
    IAqua public immutable AQUA;
    address public immutable APP;

    address public strategist;
    bytes32 public currentStrategyHash;
    address[] private _currentTokens;

    event PositionOpened(bytes32 strategyHash, address[] tokens, uint256[] amounts);
    event Rebalanced(bytes32 oldStrategyHash, bytes32 newStrategyHash, uint256[] newAmounts);
    event EmergencyDocked(bytes32 strategyHash);
    event StrategistReassigned(address oldStrategist, address newStrategist);

    error NotStrategist(address caller);
    error NoActivePosition();

    constructor(IAqua aqua_, address app_, address strategist_, address owner_) Ownable(owner_) {
        AQUA = aqua_;
        APP = app_;
        strategist = strategist_;
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

    /// @notice Strategist-only: adjust the position's parameters within whatever bounds
    ///         `newStrategyData`/`newAmounts` are validated against off-chain today.
    ///         Real mechanism: Aqua strategies are immutable once shipped, so "tuning"
    ///         is dock() the current strategy, then ship() a new one with the same
    ///         token set. No token custody ever moves outside this controller.
    ///
    /// TODO (Spike 2): replace the `require` below with an on-chain call to the
    ///      client's ENSv2 subname resolver, checking Enhanced Access Control for
    ///      the "Tuner" role held by msg.sender. That's what makes revocation
    ///      trustless -- removing the role here (not just off-chain) kills this
    ///      function immediately for that address, independent of anything else.
    function rebalance(bytes calldata newStrategyData, uint256[] calldata newAmounts) external {
        require(msg.sender == strategist, NotStrategist(msg.sender));
        require(currentStrategyHash != bytes32(0), NoActivePosition());

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
        require(currentStrategyHash != bytes32(0), NoActivePosition());
        AQUA.dock(APP, currentStrategyHash, _currentTokens);
        emit EmergencyDocked(currentStrategyHash);
        currentStrategyHash = bytes32(0);
    }

    /// @notice Owner-only: change who holds the (currently placeholder) tuning right.
    function reassignStrategist(address newStrategist) external onlyOwner {
        emit StrategistReassigned(strategist, newStrategist);
        strategist = newStrategist;
    }

    function currentTokens() external view returns (address[] memory) {
        return _currentTokens;
    }
}
