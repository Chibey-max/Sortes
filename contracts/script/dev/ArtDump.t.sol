// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SortesRenderer} from "../../src/SortesRenderer.sol";
import {Traits} from "../../src/lib/Traits.sol";

/// Dev helper (skipped unless DUMP_ART=1): writes sample plate SVGs for a visual check.
///   DUMP_ART=true ART_DIR=/tmp/art forge test --match-path 'script/dev/*' --match-test test_dumpArt
contract ArtDump is Test {
    function test_dumpArt() public {
        if (!vm.envOr("DUMP_ART", false)) return;
        SortesRenderer r = new SortesRenderer();
        string memory dir = vm.envString("ART_DIR");
        vm.writeFile(string.concat(dir, "/floor.svg"), r.svg(Traits.floor(), false, 298));
        vm.writeFile(string.concat(dir, "/pending.svg"), r.svg(Traits.floor(), true, 313));
        // The design's featured lot: gold, kleros, meander, star, legendary (#271).
        uint8[5] memory leg = [5, 5, 4, 4, 3];
        vm.writeFile(string.concat(dir, "/legendary-271.svg"), r.svg(leg, false, 271));
        uint8[5] memory rare = [4, 3, 2, 2, 2];
        vm.writeFile(string.concat(dir, "/rare-128.svg"), r.svg(rare, false, 128));
        for (uint256 i; i < 10; ++i) {
            vm.writeFile(
                string.concat(dir, "/lot", vm.toString(i), ".svg"),
                r.svg(Traits.derive(keccak256(abi.encode("art", i))), false, 100 + i * 37)
            );
        }
    }
}
