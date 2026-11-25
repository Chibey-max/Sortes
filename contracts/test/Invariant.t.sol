// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {SortesHouse} from "../src/SortesHouse.sol";
import {ISortesHouse} from "../src/interfaces/ISortesHouse.sol";
import {CommonBase} from "forge-std/Base.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {StdCheats} from "forge-std/StdCheats.sol";

/// @notice Drives random request / reveal / timeout / block-advance sequences.
contract HouseHandler is CommonBase, StdCheats, StdUtils {
    SortesHouse public h;
    bytes32[] public chain;
    uint64 public n;
    uint256[] public ids;
    mapping(uint256 => bytes32) public secretOf;
    uint256 nonce;

    constructor(SortesHouse h_, bytes32[] memory chain_, uint64 n_) {
        h = h_;
        chain = chain_;
        n = n_;
    }

    function request(uint256 who) external {
        if (h.openRequests() >= 90 || h.nextPosition() > n) return;
        address user = address(uint160(bound(who, 1000, 1010)));
        bytes32 secret = keccak256(abi.encode(nonce++));
        bytes32 c = h.commitmentOf(secret, user, user);
        vm.deal(user, 1 ether);
        vm.prank(user);
        uint256 id = h.request{value: 1 ether}(c, user);
        ids.push(id);
        secretOf[id] = secret;
    }

    function revealHouse(uint256 k) external {
        if (ids.length == 0) return;
        uint256 id = ids[k % ids.length];
        SortesHouse.Request memory r = h.getRequest(id);
        if (r.status != ISortesHouse.Status.Requested) return;
        if (block.number <= r.lockBlock || block.number > r.lockBlock + h.W_HOUSE()) return;
        if (r.position > h.lastPos() && r.position - h.lastPos() > h.MAX_SKIP()) return;
        h.revealHouse(id, chain[n - r.position]);
    }

    function revealUser(uint256 k) external {
        if (ids.length == 0) return;
        uint256 id = ids[k % ids.length];
        SortesHouse.Request memory r = h.getRequest(id);
        if (r.status != ISortesHouse.Status.HouseRevealed) return;
        if (block.number > r.houseRevealBlock + h.W_USER()) return;
        h.revealUser(id, secretOf[id]);
    }

    function timeout(uint256 k) external {
        if (ids.length == 0) return;
        try h.claimTimeout(ids[k % ids.length]) {} catch {}
    }

    function advance(uint256 blocks) external {
        vm.roll(block.number + bound(blocks, 1, 120));
    }

    function idsLength() external view returns (uint256) {
        return ids.length;
    }

    function idAt(uint256 i) external view returns (uint256) {
        return ids[i];
    }
}

contract SortesHouseInvariantTest is Base {
    HouseHandler handler;

    function setUp() public override {
        super.setUp();
        enroll();
        handler = new HouseHandler(h, chain, N);
        targetContract(address(handler));
    }

    /// Balance always equals bond + earned + fees held for open requests + owed payments.
    function invariant_balanceAccountsForEveryWei() public view {
        assertEq(address(h).balance, h.bond() + h.earned() + h.heldFees() + h.totalOwed());
    }

    /// Open-request count matches the requests that are not final.
    function invariant_openCountMatches() public view {
        uint256 open;
        for (uint256 i; i < handler.idsLength(); ++i) {
            (ISortesHouse.Status s,) = h.resultOf(handler.idAt(i));
            if (s == ISortesHouse.Status.Requested || s == ISortesHouse.Status.HouseRevealed) open++;
        }
        assertEq(open, h.openRequests());
    }

    /// Once both deadlines have passed, every request can be made final by anyone.
    function invariant_noRequestStaysOpenPastDeadlines() public {
        vm.roll(block.number + W_HOUSE + W_USER + 2);
        for (uint256 i; i < handler.idsLength(); ++i) {
            uint256 id = handler.idAt(i);
            (ISortesHouse.Status s,) = h.resultOf(id);
            if (s == ISortesHouse.Status.Requested || s == ISortesHouse.Status.HouseRevealed) {
                h.claimTimeout(id);
                if (s == ISortesHouse.Status.HouseRevealed) {
                    // A user-timeout needs the user window after the house reveal to pass too.
                }
            }
        }
        assertEq(h.openRequests(), 0);
    }
}
