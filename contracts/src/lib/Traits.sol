// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Traits
/// @notice Turns a Sortes result into five traits. Each trait rolls a tier out of 10,000
/// (Common 6,000, Uncommon 2,800, Rare 1,000, Legendary 200), then a variant within the tier.
/// The floor (every trait Common, variant 0) is what a timed-out request gets.
library Traits {
    uint256 internal constant COUNT = 5; // Background, Shape, Pattern, Eyes, Aura

    uint8 internal constant COMMON = 0;
    uint8 internal constant UNCOMMON = 1;
    uint8 internal constant RARE = 2;
    uint8 internal constant LEGENDARY = 3;

    struct Set {
        uint8[5] tier;
        uint8[5] variant;
    }

    /// @notice Tier from a roll in [0, 10000).
    function tierOf(uint256 roll) internal pure returns (uint8) {
        if (roll < 200) return LEGENDARY;
        if (roll < 1200) return RARE;
        if (roll < 4000) return UNCOMMON;
        return COMMON;
    }

    /// @notice Variants per tier: Common 4, Uncommon 3, Rare 2, Legendary 2.
    function variantsIn(uint8 tier) internal pure returns (uint256) {
        if (tier == COMMON) return 4;
        if (tier == UNCOMMON) return 3;
        return 2;
    }

    function derive(bytes32 result) internal pure returns (Set memory s) {
        for (uint256 i; i < COUNT; ++i) {
            uint256 roll = uint256(keccak256(abi.encode(result, i))) % 10000;
            uint8 tier = tierOf(roll);
            uint256 pick = uint256(keccak256(abi.encode(result, i, "v")));
            s.tier[i] = tier;
            s.variant[i] = uint8(pick % variantsIn(tier));
        }
    }

    function floor() internal pure returns (Set memory s) {
        // All zeros: every trait Common, variant 0.
        return s;
    }

    /// @notice Highest tier across the five traits (used for gallery filters).
    function topTier(Set memory s) internal pure returns (uint8 top) {
        for (uint256 i; i < COUNT; ++i) {
            if (s.tier[i] > top) top = s.tier[i];
        }
    }
}
