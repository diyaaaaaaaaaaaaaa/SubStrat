// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IAqua } from "./interfaces/IAqua.sol";
import { AquaApp } from "./AquaApp.sol";
 
contract SubStratMandateApp is AquaApp {
    struct Strategy {
        address maker;      // must be the StrategyController address (unique per mandate)
        address token0;
        address token1;
        uint256 minPrice;   // token1 per token0, 1e18-scaled. Lower bound of the tuned band.
        uint256 maxPrice;   // upper bound of the tuned band.
    }

    error PriceOutsideMandateBand(uint256 impliedPrice, uint256 minPrice, uint256 maxPrice);
    error InsufficientOutput(uint256 amountOut, uint256 amountOutMin);

    constructor(IAqua aqua) AquaApp(aqua) {}

    /// @notice Execute a swap against a mandate's live position.
    /// @param strategy The mandate's Strategy struct (must match what was shipped exactly).
    /// @param zeroForOne True: taker sends token0, receives token1. False: reverse.
    /// @param amountIn Amount of the input token the taker is sending.
    /// @param amountOutMin Taker's slippage floor on the output amount.
    /// @param recipient Who receives the output tokens.
    function swap(
        Strategy calldata strategy,
        bool zeroForOne,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient
    ) external returns (uint256 amountOut) {
        bytes32 strategyHash = keccak256(abi.encode(strategy));

        address tokenIn = zeroForOne ? strategy.token0 : strategy.token1;
        address tokenOut = zeroForOne ? strategy.token1 : strategy.token0;

        (uint256 balanceIn, uint256 balanceOut) = AQUA.safeBalances(
            strategy.maker,
            address(this),
            strategyHash,
            tokenIn,
            tokenOut
        );

        // Plain constant product, no fee: amountOut = balanceOut * amountIn / (balanceIn + amountIn)
        amountOut = (balanceOut * amountIn) / (balanceIn + amountIn);
        if (amountOut < amountOutMin) revert InsufficientOutput(amountOut, amountOutMin);

        // Implied price of this trade, always expressed as token1-per-token0 (1e18-scaled),
        // regardless of trade direction, so it compares directly against minPrice/maxPrice.
        uint256 impliedPrice = zeroForOne
            ? (amountOut * 1e18) / amountIn   // token1 out per token0 in
            : (amountIn * 1e18) / amountOut;  // token1 in per token0 out
        if (impliedPrice < strategy.minPrice || impliedPrice > strategy.maxPrice) {
            revert PriceOutsideMandateBand(impliedPrice, strategy.minPrice, strategy.maxPrice);
        }

        // Real transfer #1: maker's own wallet -> recipient (via maker's Aqua approval)
        AQUA.pull(strategy.maker, strategyHash, tokenOut, amountOut, recipient);

        // Real transfer #2: taker -> this app -> maker's wallet
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).approve(address(AQUA), amountIn);
        AQUA.push(strategy.maker, address(this), strategyHash, tokenIn, amountIn);
    }