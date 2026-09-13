// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IAqua } from "./interfaces/IAqua.sol";
import { AquaApp } from "./AquaApp.sol";

/// @title SubStratMandateApp
/// @notice The 1inch Aqua "app" for a SubStrat mandate. A taker calls `swap()` to trade
///         against the maker's (StrategyController's) shipped position. Execution price
///         is a plain constant-product quote against the position's live balances --
///         standard AMM math, no fee, no curve tricks. The mandate's `minPrice`/`maxPrice`
///         band (set at ship/rebalance time by StrategyController's ENS-gated Tuner) is
///         enforced as a hard circuit breaker: if the trade's implied price falls outside
///         the currently-tuned band, the call reverts. Nothing here decides WHO may tune
///         the band -- that permission check lives entirely in StrategyController /
///         ENSv2 Enhanced Access Control, independent of this contract.
///
/// @dev NOT YET COMPILED OR TESTED. Written directly against 1inch/aqua's real
///      Aqua.sol/AquaApp.sol source (read, not guessed) and the README's documented
///      pull/push swap pattern, but this repo's build sandbox has no network access and
///      no node_modules to compile against. Compile and run spike_app_test.js locally
///      before relying on this for the demo.
contract SubStratMandateApp is AquaApp {
    /// @notice One mandate's tradeable position. Hashed via keccak256(abi.encode(...))
    ///         to form the Aqua strategyHash -- StrategyController.shipInitial()/
    ///         rebalance() must be called with `strategyData = abi.encode(Strategy({...}))`
    ///         using these exact same field values, or the hashes won't match and Aqua's
    ///         ship() will register a position this contract can never see.
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
    /// @dev Uses the manual transferFrom+push pattern (not _safeCheckAquaPush) so no
    ///      reentrancy modifier is required -- fewer moving parts to get right same-day.
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
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IAqua } from "./interfaces/IAqua.sol";
import { AquaApp } from "./AquaApp.sol";

contract SubStratMandateApp is AquaApp {
    struct Strategy {
        address maker;
        address token0;
        address token1;
        uint256 minPrice;
        uint256 maxPrice;
    }

    error PriceOutsideMandateBand(
        uint256 impliedPrice,
        uint256 minPrice,
        uint256 maxPrice
    );
    error InsufficientOutput(uint256 amountOut, uint256 amountOutMin);

    constructor(IAqua aqua) AquaApp(aqua) {}

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

        amountOut = (balanceOut * amountIn) / (balanceIn + amountIn);

        if (amountOut < amountOutMin) {
            revert InsufficientOutput(amountOut, amountOutMin);
        }

        uint256 impliedPrice = zeroForOne
            ? (amountOut * 1e18) / amountIn
            : (amountIn * 1e18) / amountOut;

        if (
            impliedPrice < strategy.minPrice ||
            impliedPrice > strategy.maxPrice
        ) {
            revert PriceOutsideMandateBand(
                impliedPrice,
                strategy.minPrice,
                strategy.maxPrice
            );
        }

        AQUA.pull(
            strategy.maker,
            strategyHash,
            tokenOut,
            amountOut,
            recipient
        );

        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).approve(address(AQUA), amountIn);

        AQUA.push(
            strategy.maker,
            address(this),
            strategyHash,
            tokenIn,
            amountIn
        );
    }
}
```

One correction to my earlier wording: the SPDX line is technically a comment, but **do not remove it**. It's a standard Solidity license identifier and should stay at the top of the file. So this is effectively “remove the explanatory comments,” not literally every `//` line.

}
