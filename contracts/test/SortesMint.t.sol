// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {SortesMint} from "../src/SortesMint.sol";
import {SortesRenderer} from "../src/SortesRenderer.sol";
import {ISortesHouse} from "../src/interfaces/ISortesHouse.sol";
import {Traits} from "../src/lib/Traits.sol";

contract TraitsHarness {
    function derive(bytes32 r) external pure returns (uint8[5] memory, uint8[5] memory) {
        Traits.Set memory s = Traits.derive(r);
        return (s.tier, s.variant);
    }
}

contract SortesMintTest is Base {
    SortesMint m;
    SortesRenderer renderer;
    address owner = makeAddr("owner");

    function setUp() public override {
        super.setUp();
        enroll();
        renderer = new SortesRenderer();
        m = new SortesMint(ISortesHouse(address(h)), renderer, 5, 2, owner);
        vm.deal(owner, 100 ether);
    }

    function _commit(bytes32 secret, address minter) internal view returns (bytes32) {
        return h.commitmentOf(secret, minter, address(m));
    }

    function _mint(address who, bytes32 secret) internal returns (uint256 tokenId) {
        bytes32 c = _commit(secret, who);
        vm.prank(who);
        tokenId = m.mint{value: FEE}(c);
    }

    function _settle(uint256 tokenId, bytes32 secret) internal {
        uint256 id = m.lotOf(tokenId).requestId;
        revealHouseNow(id);
        h.revealUser(id, secret);
    }

    // ---------------------------------------------------------------- mint

    function test_mint_opensRequestAndMintsPending() public {
        uint256 t = _mint(user, secretFor(1));
        SortesMint.Lot memory lot = m.lotOf(t);
        assertEq(m.ownerOf(t), user);
        assertEq(lot.requestId, 1);
        assertFalse(lot.finalized);
        assertFalse(lot.sponsored);
        assertEq(h.getRequest(1).consumer, address(m));
        assertEq(h.getRequest(1).beneficiary, user);
        assertEq(m.tokenOfRequest(1), t);
    }

    function test_mint_revertsOnWrongPrice() public {
        bytes32 c = _commit(secretFor(1), user);
        vm.prank(user);
        vm.expectRevert(SortesMint.BadPrice.selector);
        m.mint{value: FEE + 1}(c);
    }

    function test_mint_supplyCap() public {
        for (uint256 i; i < 5; ++i) {
            _mint(user, secretFor(i));
        }
        bytes32 c = _commit(secretFor(9), user);
        vm.prank(user);
        vm.expectRevert(SortesMint.SoldOut.selector);
        m.mint{value: FEE}(c);
    }

    // ---------------------------------------------------------------- sponsored (QoreX cross-VM path)

    function test_mintSponsored_usesPoolWithNoValue() public {
        vm.prank(owner);
        m.sponsor{value: 3 ether}();
        bytes32 c = _commit(secretFor(1), user);
        vm.prank(user);
        uint256 t = m.mintSponsored(c);
        assertEq(m.sponsorPool(), 2 ether);
        assertTrue(m.lotOf(t).sponsored);
        assertEq(m.sponsoredMints(user), 1);
        _settle(t, secretFor(1));
        m.finalize(t);
        assertTrue(m.lotOf(t).finalized);
    }

    function test_mintSponsored_revertsWhenPoolEmpty() public {
        bytes32 c = _commit(secretFor(1), user);
        vm.prank(user);
        vm.expectRevert(SortesMint.PoolEmpty.selector);
        m.mintSponsored(c);
    }

    function test_mintSponsored_perWalletLimit() public {
        vm.prank(owner);
        m.sponsor{value: 5 ether}();
        vm.startPrank(user);
        m.mintSponsored(_commit(secretFor(1), user));
        m.mintSponsored(_commit(secretFor(2), user));
        bytes32 c = _commit(secretFor(3), user);
        vm.expectRevert(SortesMint.SponsorLimit.selector);
        m.mintSponsored(c);
        vm.stopPrank();
    }

    function test_withdrawSponsor_onlyOwner() public {
        vm.prank(owner);
        m.sponsor{value: 2 ether}();
        vm.prank(user);
        vm.expectRevert();
        m.withdrawSponsor(1 ether, user);
        vm.prank(owner);
        m.withdrawSponsor(2 ether, owner);
        assertEq(m.sponsorPool(), 0);
    }

    // ---------------------------------------------------------------- finalize

    function test_finalize_afterFulfilledDerivesTraits() public {
        uint256 t = _mint(user, secretFor(1));
        _settle(t, secretFor(1));
        m.finalize(t);
        (, bytes32 result) = h.resultOf(m.lotOf(t).requestId);
        (uint8[5] memory tier, uint8[5] memory variant) = m.traitsFor(result);
        SortesMint.Lot memory lot = m.lotOf(t);
        assertTrue(lot.finalized);
        assertFalse(lot.isFloor);
        for (uint256 i; i < 5; ++i) {
            assertEq(lot.tier[i], tier[i]);
            assertEq(lot.variant[i], variant[i]);
        }
    }

    function test_finalize_floorOnHouseTimeoutAndRefundsMinter() public {
        uint256 t = _mint(user, secretFor(1));
        uint256 id = m.lotOf(t).requestId;
        uint256 before = user.balance;
        vm.roll(h.getRequest(id).lockBlock + W_HOUSE + 1);
        h.claimTimeout(id);
        m.finalize(t);
        SortesMint.Lot memory lot = m.lotOf(t);
        assertTrue(lot.isFloor);
        for (uint256 i; i < 5; ++i) {
            assertEq(lot.tier[i], 0);
            assertEq(lot.variant[i], 0);
        }
        assertEq(user.balance, before + FEE + PENALTY);
    }

    function test_finalize_floorOnUserTimeout() public {
        uint256 t = _mint(user, secretFor(1));
        uint256 id = m.lotOf(t).requestId;
        revealHouseNow(id);
        vm.roll(block.number + W_USER + 1);
        h.claimTimeout(id);
        m.finalize(t);
        assertTrue(m.lotOf(t).isFloor);
    }

    function test_finalize_revertsWhenNotFinal() public {
        uint256 t = _mint(user, secretFor(1));
        vm.expectRevert(SortesMint.NotFinal.selector);
        m.finalize(t);
        revealHouseNow(m.lotOf(t).requestId);
        vm.expectRevert(SortesMint.NotFinal.selector);
        m.finalize(t);
    }

    function test_finalize_onlyOnce() public {
        uint256 t = _mint(user, secretFor(1));
        _settle(t, secretFor(1));
        m.finalize(t);
        vm.expectRevert(SortesMint.AlreadyFinalized.selector);
        m.finalize(t);
    }

    function test_traits_deterministic() public {
        bytes32 r = keccak256("some result");
        (uint8[5] memory a, uint8[5] memory av) = m.traitsFor(r);
        (uint8[5] memory b, uint8[5] memory bv) = m.traitsFor(r);
        for (uint256 i; i < 5; ++i) {
            assertEq(a[i], b[i]);
            assertEq(av[i], bv[i]);
        }
    }

    // ---------------------------------------------------------------- tokenURI

    function test_tokenURI_validJsonPendingAndFinal() public {
        uint256 t = _mint(user, secretFor(1));
        string memory pendingUri = m.tokenURI(t);
        assertGt(bytes(pendingUri).length, 100);
        _settle(t, secretFor(1));
        m.finalize(t);
        string memory uri = m.tokenURI(t);
        // Decode and parse: forge-std's JSON parser throws on invalid JSON.
        string memory json = _decode(uri);
        assertEq(vm.parseJsonString(json, ".name"), "Sortes Lot #1");
        string memory image = vm.parseJsonString(json, ".image");
        assertTrue(_startsWith(image, "data:image/svg+xml;base64,"));
        string memory outcome = vm.parseJsonString(json, ".attributes[10].value");
        assertEq(outcome, "Fair roll");
    }

    function test_tokenURI_revertsForUnknownToken() public {
        vm.expectRevert();
        m.tokenURI(42);
    }

    // ---------------------------------------------------------------- fuzz

    /// Trait derivation always lands inside the tier ranges and variant counts.
    function testFuzz_traitsWithinRanges(bytes32 result) public {
        TraitsHarness th = new TraitsHarness();
        (uint8[5] memory tier, uint8[5] memory variant) = th.derive(result);
        for (uint256 i; i < 5; ++i) {
            assertLe(tier[i], 3);
            uint256 count = tier[i] == 0 ? 4 : tier[i] == 1 ? 3 : 2;
            assertLt(variant[i], count);
            // Every (tier, variant) has art and a name.
            assertGt(bytes(renderer.variantName(i, tier[i], variant[i])).length, 0);
        }
    }

    function test_traitTierBoundaries() public pure {
        assertEq(Traits.tierOf(0), 3);
        assertEq(Traits.tierOf(199), 3);
        assertEq(Traits.tierOf(200), 2);
        assertEq(Traits.tierOf(1199), 2);
        assertEq(Traits.tierOf(1200), 1);
        assertEq(Traits.tierOf(3999), 1);
        assertEq(Traits.tierOf(4000), 0);
        assertEq(Traits.tierOf(9999), 0);
    }

    // ---------------------------------------------------------------- helpers

    function _decode(string memory uri) internal pure returns (string memory) {
        bytes memory u = bytes(uri);
        uint256 start = bytes("data:application/json;base64,").length;
        bytes memory b64 = new bytes(u.length - start);
        for (uint256 i; i < b64.length; ++i) {
            b64[i] = u[start + i];
        }
        return string(_b64decode(b64));
    }

    function _startsWith(string memory s, string memory p) internal pure returns (bool) {
        bytes memory a = bytes(s);
        bytes memory b = bytes(p);
        if (a.length < b.length) return false;
        for (uint256 i; i < b.length; ++i) {
            if (a[i] != b[i]) return false;
        }
        return true;
    }

    function _b64decode(bytes memory data) internal pure returns (bytes memory out) {
        bytes memory table = bytes("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
        uint8[128] memory rev;
        for (uint8 i; i < 64; ++i) {
            rev[uint8(table[i])] = i;
        }
        uint256 pad;
        if (data.length > 0 && data[data.length - 1] == "=") pad++;
        if (data.length > 1 && data[data.length - 2] == "=") pad++;
        out = new bytes((data.length / 4) * 3 - pad);
        uint256 o;
        for (uint256 i; i < data.length; i += 4) {
            uint256 n = (uint256(rev[uint8(data[i])]) << 18) | (uint256(rev[uint8(data[i + 1])]) << 12)
                | (uint256(rev[uint8(data[i + 2])]) << 6) | uint256(rev[uint8(data[i + 3])]);
            if (o < out.length) out[o++] = bytes1(uint8(n >> 16));
            if (o < out.length) out[o++] = bytes1(uint8(n >> 8));
            if (o < out.length) out[o++] = bytes1(uint8(n));
        }
    }
}
