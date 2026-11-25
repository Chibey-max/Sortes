// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {SortesRenderer} from "../../src/SortesRenderer.sol";
import {Traits} from "../../src/lib/Traits.sol";
/// Dev helper (skipped unless DUMP_ART=1): writes sample SVGs for a visual check.
contract ArtDump is Test {
    function test_dumpArt() public {
        if (!vm.envOr("DUMP_ART", false)) return;
        SortesRenderer r = new SortesRenderer();
        string memory dir = vm.envString("ART_DIR");
        Traits.Set memory floorSet;
        vm.writeFile(string.concat(dir, "/floor.svg"), r.svg(floorSet, false, 1));
        vm.writeFile(string.concat(dir, "/pending.svg"), r.svg(floorSet, true, 42));
        for (uint256 i; i < 10; ++i) {
            Traits.Set memory s = Traits.derive(keccak256(abi.encode("art", i)));
            vm.writeFile(string.concat(dir, "/lot", vm.toString(i), ".svg"), r.svg(s, false, i));
        }
        // One of every legendary combination too.
        Traits.Set memory l;
        for (uint256 t; t < 5; ++t) l.tier[t] = 3;
        vm.writeFile(string.concat(dir, "/legendary0.svg"), r.svg(l, false, 7));
        for (uint256 t; t < 5; ++t) l.variant[t] = 1;
        vm.writeFile(string.concat(dir, "/legendary1.svg"), r.svg(l, false, 8));
    }
}
