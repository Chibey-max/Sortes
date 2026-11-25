// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {SortesHouse} from "../src/SortesHouse.sol";
import {ISortesHouse} from "../src/interfaces/ISortesHouse.sol";
import {PqcKeyStatusMock, MockSig} from "./mocks/PqcMock.sol";

contract Rejecter {
    receive() external payable {
        revert("no");
    }
}

contract SortesHouseTest is Base {
    // ================================================================ enroll

    function test_enroll_happyPath() public {
        enroll();
        assertTrue(h.enrolled());
        assertTrue(h.accepting());
        assertEq(h.anchor(), anchorOf());
        assertEq(h.bond(), MIN_BOND);
        assertEq(h.lastVal(), anchorOf());
        assertEq(h.nextPosition(), 1);
        assertEq(h.adminNonce(), 1);
    }

    function test_enroll_revertsWhenKeyNotRegistered() public {
        PqcKeyStatusMock(PQC_KEY_STATUS).setKey(houseOp, false, 0, "");
        bytes memory s = sig(h.ACTION_ENROLL(), abi.encode(anchorOf(), N, MIN_BOND));
        vm.prank(houseOp);
        vm.expectRevert(SortesHouse.KeyNotRegistered.selector);
        h.enroll{value: MIN_BOND}(anchorOf(), N, s);
    }

    function test_enroll_revertsWhenKeyIsNotMlDsa87() public {
        PqcKeyStatusMock(PQC_KEY_STATUS).setKey(houseOp, true, 2, housePk);
        bytes memory s = sig(h.ACTION_ENROLL(), abi.encode(anchorOf(), N, MIN_BOND));
        vm.prank(houseOp);
        vm.expectRevert(SortesHouse.KeyNotProven.selector);
        h.enroll{value: MIN_BOND}(anchorOf(), N, s);
    }

    function test_enroll_revertsOnBadSignature() public {
        bytes memory s = MockSig.sign(hex"bad0", h.adminDigest(h.ACTION_ENROLL(), abi.encode(anchorOf(), N, MIN_BOND)));
        vm.prank(houseOp);
        vm.expectRevert(SortesHouse.BadPqcSignature.selector);
        h.enroll{value: MIN_BOND}(anchorOf(), N, s);
    }

    function test_enroll_signatureBindsAnchor() public {
        bytes memory s = sig(h.ACTION_ENROLL(), abi.encode(anchorOf(), N, MIN_BOND));
        vm.prank(houseOp);
        vm.expectRevert(SortesHouse.BadPqcSignature.selector);
        h.enroll{value: MIN_BOND}(keccak256("other anchor"), N, s);
    }

    function test_enroll_revertsWhenBondTooLow() public {
        bytes memory s = sig(h.ACTION_ENROLL(), abi.encode(anchorOf(), N, MIN_BOND - 1));
        vm.prank(houseOp);
        vm.expectRevert(SortesHouse.BondTooLow.selector);
        h.enroll{value: MIN_BOND - 1}(anchorOf(), N, s);
    }

    function test_enroll_revertsOnDoubleEnroll() public {
        enroll();
        bytes memory s = sig(h.ACTION_ENROLL(), abi.encode(anchorOf(), N, MIN_BOND));
        vm.prank(houseOp);
        vm.expectRevert(SortesHouse.AlreadyEnrolled.selector);
        h.enroll{value: MIN_BOND}(anchorOf(), N, s);
    }

    function test_enroll_signatureForAnotherDeploymentRejected() public {
        SortesHouse other = new SortesHouse(houseOp, payoutAddr, LOCK_DELAY, W_HOUSE, W_USER, MAX_SKIP, FEE, PENALTY, MIN_BOND);
        bytes memory s = MockSig.sign(housePk, other.adminDigest(other.ACTION_ENROLL(), abi.encode(anchorOf(), N, MIN_BOND)));
        vm.prank(houseOp);
        vm.expectRevert(SortesHouse.BadPqcSignature.selector);
        h.enroll{value: MIN_BOND}(anchorOf(), N, s);
    }

    // ================================================================ request

    function test_request_happyPath() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        SortesHouse.Request memory r = h.getRequest(id);
        assertEq(id, 1);
        assertEq(r.consumer, user);
        assertEq(r.position, 1);
        assertEq(r.lockBlock, block.number + LOCK_DELAY);
        assertEq(uint8(r.status), uint8(ISortesHouse.Status.Requested));
        assertEq(h.openRequests(), 1);
        assertEq(h.heldFees(), FEE);
    }

    function test_request_revertsOnWrongFee() public {
        enroll();
        vm.prank(user);
        vm.expectRevert(SortesHouse.BadFee.selector);
        h.request{value: FEE - 1}(keccak256("c"), user);
    }

    function test_request_revertsWhenNotAccepting() public {
        vm.prank(user);
        vm.expectRevert(SortesHouse.NotAccepting.selector);
        h.request{value: FEE}(keccak256("c"), user);
    }

    function test_request_revertsWhenBondCannotCoverPenalties() public {
        enroll(); // bond 200 covers 100 open requests at 2 each
        for (uint256 i; i < 100; ++i) {
            open(user, user, secretFor(i));
        }
        bytes32 c = h.commitmentOf(secretFor(999), user, user);
        vm.prank(user);
        vm.expectRevert(SortesHouse.BondTooLow.selector);
        h.request{value: FEE}(c, user);
    }

    function test_request_positionsIncrease() public {
        enroll();
        uint256 a = open(user, user, secretFor(1));
        uint256 b = open(user2, user2, secretFor(2));
        assertEq(pos(a), 1);
        assertEq(pos(b), 2);
        assertEq(h.nextPosition(), 3);
    }

    function test_request_revertsWhenChainExhausted() public {
        // Tiny chain of 1 link.
        SortesHouse small = new SortesHouse(houseOp, payoutAddr, LOCK_DELAY, W_HOUSE, W_USER, MAX_SKIP, FEE, PENALTY, MIN_BOND);
        bytes32 a = keccak256("tip");
        bytes memory s = MockSig.sign(housePk, small.adminDigest(small.ACTION_ENROLL(), abi.encode(a, uint64(1), MIN_BOND)));
        vm.prank(houseOp);
        small.enroll{value: MIN_BOND}(a, 1, s);
        vm.prank(user);
        small.request{value: FEE}(keccak256("c1"), user);
        vm.prank(user);
        vm.expectRevert(SortesHouse.ChainExhausted.selector);
        small.request{value: FEE}(keccak256("c2"), user);
    }

    // ================================================================ house reveal

    function test_revealHouse_happyPath() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        vm.roll(h.getRequest(id).lockBlock + 1);
        h.revealHouse(id, v(1));
        SortesHouse.Request memory r = h.getRequest(id);
        assertEq(uint8(r.status), uint8(ISortesHouse.Status.HouseRevealed));
        assertEq(r.houseValue, v(1));
        assertEq(h.lastPos(), 1);
        assertEq(h.lastVal(), v(1));
    }

    function test_revealHouse_revertsTooEarly() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        vm.roll(h.getRequest(id).lockBlock);
        vm.expectRevert(SortesHouse.TooEarly.selector);
        h.revealHouse(id, v(1));
    }

    function test_revealHouse_revertsTooLate() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        vm.roll(h.getRequest(id).lockBlock + W_HOUSE + 1);
        vm.expectRevert(SortesHouse.TooLate.selector);
        h.revealHouse(id, v(1));
    }

    function test_revealHouse_revertsOnWrongValue() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        vm.roll(h.getRequest(id).lockBlock + 1);
        vm.expectRevert(SortesHouse.BadReveal.selector);
        h.revealHouse(id, keccak256("forged"));
    }

    function test_revealHouse_revertsWhenValueIsFromAnotherPosition() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        vm.roll(h.getRequest(id).lockBlock + 1);
        vm.expectRevert(SortesHouse.BadReveal.selector);
        h.revealHouse(id, v(2));
    }

    function test_revealHouse_revertsOnSkipOver32() public {
        enroll();
        uint256 last;
        for (uint256 i; i < 33; ++i) {
            last = open(user, user, secretFor(i));
        }
        vm.roll(h.getRequest(last).lockBlock + 1);
        vm.expectRevert(SortesHouse.SkipTooFar.selector);
        h.revealHouse(last, v(33));
    }

    function test_checkpoint_unblocksLongSkip() public {
        enroll();
        uint256 last;
        for (uint256 i; i < 40; ++i) {
            last = open(user, user, secretFor(i));
        }
        h.checkpoint(30, v(30));
        vm.roll(h.getRequest(last).lockBlock + 1);
        h.revealHouse(last, v(40));
        assertEq(h.lastPos(), 40);
    }

    function test_checkpoint_cannotRevealUnassignedPosition() public {
        enroll();
        open(user, user, secretFor(1));
        vm.expectRevert(SortesHouse.BadParams.selector);
        h.checkpoint(2, v(2));
    }

    function test_revealHouse_earlierPositionDerived() public {
        enroll();
        uint256 a = open(user, user, secretFor(1));
        uint256 b = open(user2, user2, secretFor(2));
        vm.roll(h.getRequest(b).lockBlock + 1);
        h.revealHouse(b, v(2)); // reveal the later one first
        h.revealHouse(a, v(1)); // earlier one is derived from the checkpoint
        assertEq(h.getRequest(a).houseValue, v(1));
        assertEq(h.lastPos(), 2);
    }

    function test_revealHouse_storesLockHashWhenChainServesIt() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        uint64 lockBlock = h.getRequest(id).lockBlock;
        vm.roll(lockBlock + 1);
        vm.setBlockhash(lockBlock, keccak256("lock block hash"));
        h.revealHouse(id, v(1));
        assertEq(h.getRequest(id).lockHash, keccak256("lock block hash"));
    }

    function test_revealHouse_worksWhenChainServesNoBlockhash() public {
        // diana returned zero for blockhash on day 0; the protocol must still work.
        enroll();
        uint256 id = open(user, user, secretFor(1));
        uint64 lockBlock = h.getRequest(id).lockBlock;
        vm.roll(lockBlock + 1);
        vm.setBlockhash(lockBlock, bytes32(0));
        h.revealHouse(id, v(1));
        assertEq(h.getRequest(id).lockHash, bytes32(0));
        h.revealUser(id, secretFor(1));
        assertEq(uint8(statusOf(id)), uint8(ISortesHouse.Status.Fulfilled));
    }

    // ================================================================ user reveal

    function test_revealUser_happyPathMatchesFormula() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        revealHouseNow(id);
        h.revealUser(id, secretFor(1));
        (ISortesHouse.Status s, bytes32 result) = h.resultOf(id);
        assertEq(uint8(s), uint8(ISortesHouse.Status.Fulfilled));
        bytes32 expected = keccak256(
            abi.encode("SORTES-RESULT-v1", v(1), secretFor(1), h.getRequest(id).lockHash, id, address(h), block.chainid)
        );
        assertEq(result, expected);
        assertEq(h.earned(), FEE);
        assertEq(h.openRequests(), 0);
    }

    function test_revealUser_revertsOnWrongSecret() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        revealHouseNow(id);
        vm.expectRevert(SortesHouse.BadSecret.selector);
        h.revealUser(id, secretFor(2));
    }

    function test_revealUser_secretBoundToBeneficiary() public {
        enroll();
        // Commitment made for user2, request opened for user: the secret does not match.
        bytes32 c = h.commitmentOf(secretFor(1), user2, user);
        vm.prank(user);
        uint256 id = h.request{value: FEE}(c, user);
        revealHouseNow(id);
        vm.expectRevert(SortesHouse.BadSecret.selector);
        h.revealUser(id, secretFor(1));
    }

    function test_revealUser_secretBoundToConsumer() public {
        enroll();
        bytes32 c = h.commitmentOf(secretFor(1), user, user2); // made for another consumer
        vm.prank(user);
        uint256 id = h.request{value: FEE}(c, user);
        revealHouseNow(id);
        vm.expectRevert(SortesHouse.BadSecret.selector);
        h.revealUser(id, secretFor(1));
    }

    function test_revealUser_revertsTooLate() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        revealHouseNow(id);
        vm.roll(block.number + W_USER + 1);
        vm.expectRevert(SortesHouse.TooLate.selector);
        h.revealUser(id, secretFor(1));
    }

    function test_revealUser_revertsBeforeHouseReveal() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        vm.expectRevert(SortesHouse.BadStatus.selector);
        h.revealUser(id, secretFor(1));
    }

    // ================================================================ timeouts

    function test_houseTimeout_paysFeePlusPenalty() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        uint256 before = user.balance;
        vm.roll(h.getRequest(id).lockBlock + W_HOUSE + 1);
        vm.prank(thief); // anyone can call
        h.claimTimeout(id);
        assertEq(uint8(statusOf(id)), uint8(ISortesHouse.Status.HouseTimedOut));
        assertEq(user.balance, before + FEE + PENALTY);
        assertEq(h.bond(), MIN_BOND - PENALTY);
        assertEq(h.openRequests(), 0);
        (, bytes32 result) = h.resultOf(id);
        assertEq(result, bytes32(0));
    }

    function test_userTimeout_creditsHouse() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        revealHouseNow(id);
        vm.roll(block.number + W_USER + 1);
        vm.prank(thief);
        h.claimTimeout(id);
        assertEq(uint8(statusOf(id)), uint8(ISortesHouse.Status.UserTimedOut));
        assertEq(h.earned(), FEE);
        assertEq(h.bond(), MIN_BOND);
    }

    function test_houseTimeout_notBeforeDeadline() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        vm.roll(h.getRequest(id).lockBlock + W_HOUSE);
        vm.expectRevert(SortesHouse.TooEarly.selector);
        h.claimTimeout(id);
    }

    function test_userTimeout_notBeforeDeadline() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        revealHouseNow(id);
        vm.roll(block.number + W_USER);
        vm.expectRevert(SortesHouse.TooEarly.selector);
        h.claimTimeout(id);
    }

    function test_timeout_cannotBeClaimedTwiceOrOnFulfilled() public {
        enroll();
        (uint256 id,) = fullfill(user, user, secretFor(1));
        vm.roll(block.number + 1_000);
        vm.expectRevert(SortesHouse.BadStatus.selector);
        h.claimTimeout(id);
    }

    function test_houseTimeout_refundToRejectingContractIsOwedNotStuck() public {
        enroll();
        Rejecter r = new Rejecter();
        uint256 id = open(address(r), address(r), secretFor(1));
        vm.roll(h.getRequest(id).lockBlock + W_HOUSE + 1);
        h.claimTimeout(id);
        assertEq(h.owed(address(r)), FEE + PENALTY);
        assertEq(h.totalOwed(), FEE + PENALTY);
    }

    function test_claimOwed_paysOut() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        // Make `user` reject for a moment by giving it rejecting code.
        vm.etch(user, address(new Rejecter()).code);
        vm.roll(h.getRequest(id).lockBlock + W_HOUSE + 1);
        h.claimTimeout(id);
        vm.etch(user, "");
        uint256 before = user.balance;
        vm.prank(user);
        h.claimOwed();
        assertEq(user.balance, before + FEE + PENALTY);
        assertEq(h.totalOwed(), 0);
    }

    // ================================================================ admin (ML-DSA)

    function _earnFees(uint256 k) internal {
        for (uint256 i; i < k; ++i) {
            fullfill(user, user, secretFor(100 + i));
        }
    }

    function test_withdraw_withValidSignature() public {
        enroll();
        _earnFees(3);
        uint256 amount = 3 ether;
        bytes memory s = sig(h.ACTION_WITHDRAW(), abi.encode(amount));
        h.withdraw(amount, s); // anyone can carry the signature; money goes to payout
        assertEq(payoutAddr.balance, amount);
        assertEq(h.earned(), 0);
    }

    function test_withdraw_badSignature() public {
        enroll();
        _earnFees(1);
        bytes memory s = sig(h.ACTION_WITHDRAW(), abi.encode(uint256(2 ether))); // signed a different amount
        vm.expectRevert(SortesHouse.BadPqcSignature.selector);
        h.withdraw(1 ether, s);
    }

    function test_withdraw_replayRejected() public {
        enroll();
        _earnFees(2);
        bytes memory s = sig(h.ACTION_WITHDRAW(), abi.encode(uint256(1 ether)));
        h.withdraw(1 ether, s);
        vm.expectRevert(SortesHouse.BadPqcSignature.selector);
        h.withdraw(1 ether, s);
    }

    function test_withdraw_blockedBelowCover() public {
        enroll();
        for (uint256 i; i < 10; ++i) {
            open(user, user, secretFor(i)); // 10 open requests need 20 QOR cover
        }
        uint256 amount = MIN_BOND - 20 ether + 1;
        bytes memory s = sig(h.ACTION_WITHDRAW(), abi.encode(amount));
        vm.expectRevert(SortesHouse.BondTooLow.selector);
        h.withdraw(amount, s);
        // Exactly the free bond is fine.
        amount = MIN_BOND - 20 ether;
        h.withdraw(amount, s = sig(h.ACTION_WITHDRAW(), abi.encode(amount)));
        assertEq(h.bond(), 20 ether);
    }

    function test_setPayout_validAndBad() public {
        enroll();
        address np = makeAddr("newPayout");
        bytes memory wrong = sig(h.ACTION_SET_PAYOUT(), abi.encode(thief));
        vm.expectRevert(SortesHouse.BadPqcSignature.selector);
        h.setPayout(np, wrong);
        h.setPayout(np, sig(h.ACTION_SET_PAYOUT(), abi.encode(np)));
        assertEq(h.payout(), np);
    }

    function test_rotateAnchor_withValidSignature() public {
        enroll();
        _earnFees(1);
        bytes32 a2 = keccak256("new anchor");
        h.rotateAnchor(a2, 500, sig(h.ACTION_ROTATE(), abi.encode(a2, uint64(500))));
        assertEq(h.anchor(), a2);
        assertEq(h.chainLength(), 500);
        assertEq(h.nextPosition(), 1);
        assertEq(h.lastPos(), 0);
    }

    function test_rotateAnchor_blockedWithOpenRequests() public {
        enroll();
        open(user, user, secretFor(1));
        bytes32 a2 = keccak256("new anchor");
        bytes memory s = sig(h.ACTION_ROTATE(), abi.encode(a2, uint64(500)));
        vm.expectRevert(SortesHouse.OpenRequests.selector);
        h.rotateAnchor(a2, 500, s);
    }

    function test_setAccepting_pausesAndResumes() public {
        enroll();
        h.setAccepting(false, sig(h.ACTION_SET_ACCEPTING(), abi.encode(false)));
        assertFalse(h.accepting());
        vm.prank(user);
        vm.expectRevert(SortesHouse.NotAccepting.selector);
        h.request{value: FEE}(keccak256("c"), user);
        h.setAccepting(true, sig(h.ACTION_SET_ACCEPTING(), abi.encode(true)));
        assertTrue(h.accepting());
    }

    function test_setAccepting_badSignature() public {
        enroll();
        bytes memory s = sig(h.ACTION_SET_ACCEPTING(), abi.encode(true));
        vm.expectRevert(SortesHouse.BadPqcSignature.selector);
        h.setAccepting(false, s);
    }

    function test_adminSignature_cannotBeUsedForAnotherAction() public {
        enroll();
        _earnFees(1);
        // A pause signature with the same params encoding cannot authorise anything else.
        bytes memory s = sig(h.ACTION_SET_ACCEPTING(), abi.encode(uint256(1)));
        vm.expectRevert(SortesHouse.BadPqcSignature.selector);
        h.withdraw(1, s);
    }

    // ================================================================ guarantees (PRD section 9)

    /// G1: the house alone can't steer a result. Its value is fixed by the anchor, so the only
    /// value it can post for a request is v[p]; any other value reverts.
    function test_guarantee1_houseCannotSteer() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        vm.roll(h.getRequest(id).lockBlock + 1);
        for (uint256 i; i < 5; ++i) {
            vm.expectRevert(SortesHouse.BadReveal.selector);
            h.revealHouse(id, keccak256(abi.encode("try", i)));
        }
        h.revealHouse(id, v(1));
        assertEq(h.getRequest(id).houseValue, v(1));
    }

    /// G2: the user alone can't steer a result. After seeing the house value the only secret
    /// that settles is the committed one.
    function test_guarantee2_userCannotSteer() public {
        enroll();
        uint256 id = open(user, user, secretFor(1));
        revealHouseNow(id);
        for (uint256 i = 2; i < 6; ++i) {
            vm.expectRevert(SortesHouse.BadSecret.selector);
            h.revealUser(id, secretFor(i));
        }
        h.revealUser(id, secretFor(1));
    }

    /// G3: silence never helps. Both timeouts give the floor (zero) result, never a re-roll.
    function test_guarantee3_silenceGivesFloor() public {
        enroll();
        uint256 a = open(user, user, secretFor(1));
        uint256 b = open(user2, user2, secretFor(2));
        vm.roll(h.getRequest(b).lockBlock + 1);
        h.revealHouse(b, v(pos(b)));
        vm.roll(block.number + W_USER + W_HOUSE + 1);
        h.claimTimeout(a);
        h.claimTimeout(b);
        (, bytes32 ra) = h.resultOf(a);
        (, bytes32 rb) = h.resultOf(b);
        assertEq(ra, bytes32(0));
        assertEq(rb, bytes32(0));
        // No path back to a fresh roll.
        vm.expectRevert(SortesHouse.BadStatus.selector);
        h.revealUser(b, secretFor(2));
    }

    /// G4: funds never get stuck. Every request ends final once both deadlines pass, and the
    /// contract balance is exactly bond + earned + held fees + owed.
    function test_guarantee4_fundsNeverStuck() public {
        enroll();
        uint256[] memory ids = new uint256[](6);
        for (uint256 i; i < 6; ++i) {
            ids[i] = open(user, user, secretFor(i));
        }
        vm.roll(h.getRequest(ids[5]).lockBlock + 1);
        h.revealHouse(ids[0], v(pos(ids[0])));
        h.revealHouse(ids[1], v(pos(ids[1])));
        h.revealUser(ids[0], secretFor(0));
        vm.roll(block.number + W_HOUSE + W_USER + 1);
        for (uint256 i = 1; i < 6; ++i) {
            h.claimTimeout(ids[i]);
        }
        assertEq(h.openRequests(), 0);
        assertEq(h.heldFees(), 0);
        assertEq(address(h).balance, h.bond() + h.earned() + h.heldFees() + h.totalOwed());
    }

    /// G5: a stolen ECDSA key can't move the house's money. The thief here IS the house
    /// account's EVM sender (inside an open window) but has no ML-DSA key.
    function test_guarantee5_ecdsaOnlyThiefFails() public {
        enroll();
        _earnFees(2);
        bytes memory forged = MockSig.sign(hex"7171ef00", h.adminDigest(h.ACTION_WITHDRAW(), abi.encode(uint256(2 ether))));
        vm.startPrank(houseOp);
        vm.expectRevert(SortesHouse.BadPqcSignature.selector);
        h.withdraw(2 ether, forged);
        vm.expectRevert(SortesHouse.BadPqcSignature.selector);
        h.setPayout(houseOp, "");
        vm.expectRevert(SortesHouse.BadPqcSignature.selector);
        h.setAccepting(false, "");
        vm.stopPrank();
        assertEq(h.earned(), 2 ether);
        assertEq(h.payout(), payoutAddr);
    }

    // ================================================================ fuzz

    /// Chain-link check with random skip lengths: the true value always passes, a neighbour never.
    function testFuzz_chainLinkWithRandomSkips(uint8[8] memory skips) public {
        enroll();
        uint64 p;
        for (uint256 i; i < skips.length; ++i) {
            uint64 step = uint64(bound(skips[i], 1, MAX_SKIP));
            if (p + step > 95) break; // bond covers 100 open requests
            for (uint64 k; k < step; ++k) {
                open(user, user, secretFor(uint256(p) + k));
            }
            p += step;
            vm.expectRevert(SortesHouse.BadReveal.selector);
            h.checkpoint(p, v(p - 1));
            h.checkpoint(p, v(p));
            assertEq(h.lastPos(), p);
        }
    }

    /// Commit binding: a random secret settles only itself.
    function testFuzz_commitBinding(bytes32 secret, bytes32 other) public {
        vm.assume(secret != other);
        enroll();
        uint256 id = open(user, user, secret);
        revealHouseNow(id);
        vm.expectRevert(SortesHouse.BadSecret.selector);
        h.revealUser(id, other);
        h.revealUser(id, secret);
        assertEq(uint8(statusOf(id)), uint8(ISortesHouse.Status.Fulfilled));
    }
}
