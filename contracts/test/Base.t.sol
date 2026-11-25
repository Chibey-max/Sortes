// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SortesHouse} from "../src/SortesHouse.sol";
import {SortesMint} from "../src/SortesMint.sol";
import {SortesRenderer} from "../src/SortesRenderer.sol";
import {ISortesHouse} from "../src/interfaces/ISortesHouse.sol";
import {PqcVerifyMock, PqcKeyStatusMock, MockSig} from "./mocks/PqcMock.sol";

/// @notice Shared setup: precompile mocks, a house with testnet parameters, a small hash chain.
abstract contract Base is Test {
    address constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;
    address constant PQC_KEY_STATUS = 0x0000000000000000000000000000000000000a02;

    uint256 constant LOCK_DELAY = 2;
    uint256 constant W_HOUSE = 100;
    uint256 constant W_USER = 150;
    uint256 constant MAX_SKIP = 32;
    uint256 constant FEE = 1 ether;
    uint256 constant PENALTY = 2 ether;
    uint256 constant MIN_BOND = 200 ether;
    uint64 constant N = 200;

    address houseOp = makeAddr("house");
    address payoutAddr = makeAddr("payout");
    address user = makeAddr("user");
    address user2 = makeAddr("user2");
    address thief = makeAddr("thief");
    bytes housePk = hex"a11ce0";

    SortesHouse h;
    bytes32 seed = keccak256("sortes-test-seed");
    bytes32[] chain; // chain[i] = h[i]; v[p] = chain[N - p]

    function setUp() public virtual {
        vm.etch(PQC_VERIFY, address(new PqcVerifyMock()).code);
        vm.etch(PQC_KEY_STATUS, address(new PqcKeyStatusMock()).code);
        PqcKeyStatusMock(PQC_KEY_STATUS).setKey(houseOp, true, 1, housePk);

        h = new SortesHouse(houseOp, payoutAddr, LOCK_DELAY, W_HOUSE, W_USER, MAX_SKIP, FEE, PENALTY, MIN_BOND);
        _buildChain(seed, N);
        vm.deal(houseOp, 10_000 ether);
        vm.deal(user, 1_000 ether);
        vm.deal(user2, 1_000 ether);
        vm.deal(thief, 1_000 ether);
    }

    // ---------------------------------------------------------------- helpers

    function _buildChain(bytes32 s, uint64 n) internal {
        delete chain;
        bytes32 x = keccak256(abi.encodePacked(s));
        chain.push(x);
        for (uint256 i = 1; i <= n; ++i) {
            x = keccak256(abi.encodePacked(x));
            chain.push(x);
        }
    }

    function anchorOf() internal view returns (bytes32) {
        return chain[N];
    }

    function v(uint64 p) internal view returns (bytes32) {
        return chain[N - p];
    }

    function sig(bytes32 action, bytes memory params) internal view returns (bytes memory) {
        return MockSig.sign(housePk, h.adminDigest(action, params));
    }

    function enroll() internal {
        bytes memory s = sig(h.ACTION_ENROLL(), abi.encode(anchorOf(), N, MIN_BOND));
        vm.prank(houseOp);
        h.enroll{value: MIN_BOND}(anchorOf(), N, s);
    }

    function secretFor(uint256 i) internal pure returns (bytes32) {
        return keccak256(abi.encode("secret", i));
    }

    /// @dev Open a request from `consumer` for `beneficiary` with `secret`.
    function open(address consumer, address beneficiary, bytes32 secret) internal returns (uint256 id) {
        bytes32 c = h.commitmentOf(secret, beneficiary, consumer);
        vm.deal(consumer, consumer.balance + FEE);
        vm.prank(consumer);
        id = h.request{value: FEE}(c, beneficiary);
    }

    function pos(uint256 id) internal view returns (uint64) {
        return h.getRequest(id).position;
    }

    function revealHouseNow(uint256 id) internal {
        vm.roll(h.getRequest(id).lockBlock + 1);
        h.revealHouse(id, v(pos(id)));
    }

    function fullfill(address consumer, address beneficiary, bytes32 secret) internal returns (uint256 id, bytes32 result) {
        id = open(consumer, beneficiary, secret);
        revealHouseNow(id);
        h.revealUser(id, secret);
        (, result) = h.resultOf(id);
    }

    function statusOf(uint256 id) internal view returns (ISortesHouse.Status s) {
        (s,) = h.resultOf(id);
    }
}
