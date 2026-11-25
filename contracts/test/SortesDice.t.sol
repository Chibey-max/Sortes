// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {SortesDice} from "../src/SortesDice.sol";
import {ISortesHouse} from "../src/interfaces/ISortesHouse.sol";

contract SortesDiceTest is Base {
    SortesDice d;
    address owner = makeAddr("diceOwner");

    function setUp() public override {
        super.setUp();
        enroll();
        d = new SortesDice(ISortesHouse(address(h)), 10 ether, owner);
        vm.deal(owner, 1000 ether);
        vm.prank(owner);
        d.fund{value: 100 ether}();
    }

    function _roll(uint8 pick, bytes32 secret, uint256 stake) internal returns (uint256 id) {
        bytes32 c = h.commitmentOf(secret, user, address(d));
        vm.prank(user);
        id = d.roll{value: stake + FEE}(pick, c);
    }

    /// Find a secret whose result lands on `face` for the next request id, so win/lose are both tested.
    function _settleWith(uint256 id, bytes32 secret) internal returns (uint8 face) {
        revealHouseNow(id);
        h.revealUser(id, secret);
        (, bytes32 r) = h.resultOf(id);
        face = uint8(uint256(r) % 6 + 1);
    }

    function test_roll_winPays57x_or_loseKeepsStake() public {
        uint256 id = _roll(3, secretFor(1), 1 ether);
        uint8 face = _settleWith(id, secretFor(1));
        uint256 before = user.balance;
        uint256 bankBefore = d.bankroll();
        d.settle(id);
        if (face == 3) {
            assertEq(user.balance, before + 5.7 ether);
            assertEq(d.bankroll(), bankBefore);
        } else {
            assertEq(user.balance, before);
            assertEq(d.bankroll(), bankBefore + 5.7 ether);
        }
        assertEq(d.reserved(), 0);
    }

    function test_roll_rejectsBadPickAndStake() public {
        vm.prank(user);
        vm.expectRevert(SortesDice.BadPick.selector);
        d.roll{value: 2 ether}(7, keccak256("c"));
        vm.prank(user);
        vm.expectRevert(SortesDice.BadStake.selector);
        d.roll{value: 12 ether}(1, keccak256("c"));
    }

    function test_settle_houseTimeoutRefundsStake() public {
        uint256 id = _roll(2, secretFor(1), 1 ether);
        uint256 before = user.balance;
        vm.roll(h.getRequest(id).lockBlock + W_HOUSE + 1);
        h.claimTimeout(id); // house pays fee + penalty to the player
        d.settle(id);
        assertEq(user.balance, before + FEE + PENALTY + 1 ether);
    }

    function test_settle_userTimeoutForfeitsStake() public {
        uint256 id = _roll(2, secretFor(1), 1 ether);
        revealHouseNow(id);
        vm.roll(block.number + W_USER + 1);
        h.claimTimeout(id);
        uint256 bankBefore = d.bankroll();
        d.settle(id);
        assertEq(d.bankroll(), bankBefore + 5.7 ether);
    }

    function test_settle_notFinalAndOnce() public {
        uint256 id = _roll(2, secretFor(1), 1 ether);
        vm.expectRevert(SortesDice.NotFinal.selector);
        d.settle(id);
        _settleWith(id, secretFor(1));
        d.settle(id);
        vm.expectRevert(SortesDice.AlreadySettled.selector);
        d.settle(id);
    }

    /// Win or lose, the dice contract's balance always equals bankroll + reserved payouts.
    function testFuzz_settleConservesFunds(bytes32 secret, uint8 pick, uint64 stakeRaw) public {
        pick = uint8(bound(pick, 1, 6));
        uint256 stake = bound(stakeRaw, 1, 10 ether);
        uint256 id = _roll(pick, secret, stake);
        assertEq(address(d).balance, d.bankroll() + d.reserved());
        uint8 face = _settleWith(id, secret);
        uint256 before = user.balance;
        d.settle(id);
        uint256 win = (stake * 57) / 10;
        assertEq(user.balance - before, face == pick ? win : 0);
        assertEq(d.reserved(), 0);
        assertEq(address(d).balance, d.bankroll());
    }

    function test_roll_bankrollMustCoverWin() public {
        SortesDice poor = new SortesDice(ISortesHouse(address(h)), 10 ether, owner);
        bytes32 c = h.commitmentOf(secretFor(1), user, address(poor));
        vm.prank(user);
        vm.expectRevert(SortesDice.BankrollTooLow.selector);
        poor.roll{value: 1 ether + FEE}(1, c);
    }
}
