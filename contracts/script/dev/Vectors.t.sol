// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SortesHouse} from "../../src/SortesHouse.sol";
import {SortesRenderer} from "../../src/SortesRenderer.sol";
import {Traits} from "../../src/lib/Traits.sol";

/// Dev helper: writes protocol test vectors for the web app's TypeScript mirror.
///   VECTORS_OUT=../web/test/vectors.json forge test --match-path 'script/dev/*'
contract Vectors is Test {
    function test_vectors() public {
        string memory out = vm.envOr("VECTORS_OUT", string(""));
        if (bytes(out).length == 0) return;
        vm.chainId(9800);
        SortesHouse h = new SortesHouse(address(0xBEEF), address(0xBEEF), 2, 100, 150, 32, 1 ether, 2 ether, 200 ether);
        SortesRenderer r = new SortesRenderer();
        string memory json = string.concat('{"chainId":9800,"house":"', vm.toString(address(h)), '","traits":[');
        for (uint256 i; i < 40; ++i) {
            bytes32 res = keccak256(abi.encode("vector", i));
            Traits.Set memory s = Traits.derive(res);
            json = string.concat(json, i == 0 ? "" : ",", '{"result":"', vm.toString(res), '","tier":[');
            for (uint256 t; t < 5; ++t) json = string.concat(json, t == 0 ? "" : ",", vm.toString(s.tier[t]));
            json = string.concat(json, '],"variant":[');
            for (uint256 t; t < 5; ++t) json = string.concat(json, t == 0 ? "" : ",", vm.toString(s.variant[t]));
            json = string.concat(json, '],"names":[');
            for (uint256 t; t < 5; ++t) {
                json = string.concat(json, t == 0 ? "" : ",", '"', r.variantName(t, s.tier[t], s.variant[t]), '"');
            }
            json = string.concat(json, "]}");
        }
        bytes32 secret = keccak256("secret");
        address ben = address(0x1234);
        address consumer = address(0x5678);
        bytes32 hv = keccak256("house value");
        bytes32 lh = keccak256("lock hash");
        json = string.concat(
            json, '],"commit":{"secret":"', vm.toString(secret), '","beneficiary":"', vm.toString(ben), '","consumer":"', vm.toString(consumer)
        );
        json = string.concat(json, '","commit":"', vm.toString(h.commitmentOf(secret, ben, consumer)), '"},');
        json = string.concat(
            json,
            '"result":{"houseValue":"', vm.toString(hv), '","secret":"', vm.toString(secret), '","lockHash":"', vm.toString(lh),
            '","id":7,"result":"', vm.toString(h.resultFrom(hv, secret, lh, 7)), '"}}'
        );
        vm.writeFile(out, json);
    }
}
