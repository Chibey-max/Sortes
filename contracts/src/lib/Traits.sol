// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Traits
/// @notice Turns a Sortes result into the five traits of a Lot plate. Each trait rolls
/// independently: `roll = keccak256(abi.encode(result, i)) % 10000`, then the first variant whose
/// cumulative weight (in basis points) exceeds the roll wins.
///
///   0 Metal   bronze 26%, silver 22%, iron 18%, verdigris 14%, black iron 12%, gold 8%
///   1 Emblem  owl 25%, column 22%, amphora 18%, scales 16%, laurel 14%, kleros 5%
///   2 Border  bead and reel 28%, dentil 24%, egg and dart 20%, running wave 16%, meander 12%
///   3 Seal    wheel 30%, double owl 25%, owl in wreath 20%, gorgon 16%, star 9%
///   4 Frame   common 60%, uncommon 26%, rare 10%, legendary 4%   (the lot's tier)
///
/// The floor (a timed-out request) is silver / owl / bead and reel / wheel / common.
library Traits {
    uint256 internal constant COUNT = 5;

    uint8 internal constant FRAME_COMMON = 0;
    uint8 internal constant FRAME_UNCOMMON = 1;
    uint8 internal constant FRAME_RARE = 2;
    uint8 internal constant FRAME_LEGENDARY = 3;

    /// @notice Number of variants of `trait`.
    function variantCount(uint256 trait) internal pure returns (uint256) {
        if (trait == 0 || trait == 1) return 6;
        if (trait == 2 || trait == 3) return 5;
        return 4;
    }

    /// @notice Weight of `variant` of `trait`, in basis points (sums to 10,000 per trait).
    function weightBps(uint256 trait, uint256 variant) internal pure returns (uint256) {
        if (trait == 0) return _w6(variant, [uint16(2600), 2200, 1800, 1400, 1200, 800]);
        if (trait == 1) return _w6(variant, [uint16(2500), 2200, 1800, 1600, 1400, 500]);
        if (trait == 2) return _w5(variant, [uint16(2800), 2400, 2000, 1600, 1200]);
        if (trait == 3) return _w5(variant, [uint16(3000), 2500, 2000, 1600, 900]);
        return _w4(variant, [uint16(6000), 2600, 1000, 400]);
    }

    function derive(bytes32 result) internal pure returns (uint8[5] memory t) {
        for (uint256 i; i < COUNT; ++i) {
            uint256 roll = uint256(keccak256(abi.encode(result, i))) % 10000;
            uint256 n = variantCount(i);
            uint256 acc;
            uint256 pick = n - 1;
            for (uint256 k; k < n; ++k) {
                acc += weightBps(i, k);
                if (roll < acc) {
                    pick = k;
                    break;
                }
            }
            t[i] = uint8(pick);
        }
    }

    /// @notice silver, owl, bead and reel, wheel, common.
    function floor() internal pure returns (uint8[5] memory t) {
        t[0] = 1;
    }

    function _w6(uint256 v, uint16[6] memory w) private pure returns (uint256) {
        return w[v];
    }

    function _w5(uint256 v, uint16[5] memory w) private pure returns (uint256) {
        return w[v];
    }

    function _w4(uint256 v, uint16[4] memory w) private pure returns (uint256) {
        return w[v];
    }
}
