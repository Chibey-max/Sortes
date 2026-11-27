// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Traits} from "./lib/Traits.sol";
import {PlateParts} from "./lib/PlateParts.sol";

/// @title SortesRenderer
/// @notice Draws a Sortes Lot fully on chain: a bronze allotment plate (a pinakion) whose metal,
/// emblem, border, seal and frame come from the draw. No IPFS, no off-chain files: the art can
/// be rebuilt from the chain alone. Mirrors the LotArt component of the web app.
contract SortesRenderer {
    using Strings for uint256;

    bytes private constant LETTERS = hex"ce91ce92ce93ce94ce95ce96ce97ce98ce99ce9a"; // ΑΒΓΔΕΖΗΘΙΚ
    bytes private constant UNITS = hex"ce91ce92ce93ce94ce95cf9ace96ce97ce98"; // ΑΒΓΔΕϚΖΗΘ
    bytes private constant TENS = hex"ce99ce9ace9bce9cce9dce9ece9fcea0cf98"; // ΙΚΛΜΝΞΟΠϘ
    bytes private constant HUNDREDS = hex"cea1cea3cea4cea5cea6cea7cea8cea9cfa0"; // ΡΣΤΥΦΧΨΩϠ
    bytes private constant KERAIA = hex"cab9"; // ʹ
    bytes private constant LOW_KERAIA = hex"cdb5"; // ͵

    // ---------------------------------------------------------------- names

    function traitName(uint256 trait) public pure returns (string memory) {
        if (trait == 0) return "Metal";
        if (trait == 1) return "Emblem";
        if (trait == 2) return "Border";
        if (trait == 3) return "Seal";
        return "Frame";
    }

    function variantName(uint256 trait, uint8 v) public pure returns (string memory) {
        if (trait == 0) return _pick(v, ["Bronze", "Silver", "Iron", "Verdigris", "Black iron", "Gold"]);
        if (trait == 1) return _pick(v, ["Owl", "Column", "Amphora", "Scales", "Laurel", "Kleros"]);
        if (trait == 2) return _pick5(v, ["Bead and reel", "Dentil", "Egg and dart", "Running wave", "Meander"]);
        if (trait == 3) return _pick5(v, ["Wheel", "Double owl", "Owl in wreath", "Gorgon", "Star"]);
        return _pick4(v, ["Common", "Uncommon", "Rare", "Legendary"]);
    }

    function _pick(uint8 v, string[6] memory a) private pure returns (string memory) {
        return a[v];
    }

    function _pick5(uint8 v, string[5] memory a) private pure returns (string memory) {
        return a[v];
    }

    function _pick4(uint8 v, string[4] memory a) private pure returns (string memory) {
        return a[v];
    }

    // ---------------------------------------------------------------- Greek numerals

    /// @notice The plate's section letter, Α to Κ, chosen by the lot number.
    function sectionLetter(uint256 n) public pure returns (string memory) {
        uint256 i = n % 10;
        return string(abi.encodePacked(LETTERS[i * 2], LETTERS[i * 2 + 1]));
    }

    /// @notice The lot number in Greek numerals, such as 271 → ΣΟΑʹ.
    function greek(uint256 n) public pure returns (string memory) {
        if (n == 0) return unicode"·";
        bytes memory out;
        if (n >= 1000) out = abi.encodePacked(LOW_KERAIA, _glyph(UNITS, (n / 1000) % 10));
        out = abi.encodePacked(
            out, _glyph(HUNDREDS, (n / 100) % 10), _glyph(TENS, (n / 10) % 10), _glyph(UNITS, n % 10), KERAIA
        );
        return string(out);
    }

    function _glyph(bytes memory table, uint256 digit) private pure returns (bytes memory) {
        if (digit == 0) return "";
        return abi.encodePacked(table[(digit - 1) * 2], table[(digit - 1) * 2 + 1]);
    }

    // ---------------------------------------------------------------- art

    /// @dev [base, dark, light, engraving, letter] per metal.
    function _metal(uint8 m) private pure returns (string[5] memory c) {
        if (m == 0) return ["#b47b45", "#6b4120", "#e8b77e", "#4a2b12", "#f3d3a6"];
        if (m == 1) return ["#aeb2b6", "#5f6468", "#e6e8ea", "#3c4044", "#ffffff"];
        if (m == 2) return ["#646a72", "#2c3035", "#9aa1aa", "#e7e9ec", "#ffffff"];
        if (m == 3) return ["#6a9e8b", "#2f5f50", "#b2dccb", "#183d32", "#e8f7f0"];
        if (m == 4) return ["#2c2c30", "#111113", "#5e5e65", "#d4d1ca", "#f4f1ea"];
        return ["#d6a64a", "#8a6420", "#f8dc96", "#5c3f0e", "#fff1cc"];
    }

    /// @notice The plate as an SVG. `t` = [metal, emblem, border, seal, frame].
    function svg(uint8[5] memory t, bool pending, uint256 n) public pure returns (string memory) {
        string[5] memory c = _metal(t[0]);
        bool legendary = !pending && t[4] == Traits.FRAME_LEGENDARY;
        bool framed = !pending && t[4] >= Traits.FRAME_RARE;
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 400">',
            '<defs><clipPath id="pc"><path d="M70 40 H250 L260 50 V342 L250 352 H70 L60 342 V50 Z"/></clipPath>',
            pending ? "" : PlateParts.pattern(t[2], c[3]),
            '<pattern id="cs" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6 L6 0" stroke="#ffffff" stroke-width=".5" opacity=".035"/></pattern></defs>',
            '<rect width="320" height="400" fill="#151517"/><rect width="320" height="400" fill="url(#cs)"/>',
            _frame(framed, legendary, t[4]),
            _plate(c, pending),
            pending ? "" : _inlay(c, t, n, legendary),
            pending ? _ball() : "",
            _caption(n, pending, t[4])
        );
    }

    function _frame(bool framed, bool legendary, uint8 frame) private pure returns (string memory) {
        string memory col = frame == Traits.FRAME_LEGENDARY ? "#e2b65a" : "#79b8d6";
        return string.concat(
            '<g fill="none" stroke-linejoin="round"><path d="M60 30 H260 L270 40 V352 L260 362 H60 L50 352 V40 Z" stroke="',
            col,
            '" stroke-width="1.4" opacity="',
            framed ? "1" : "0",
            '"/><path d="M52 22 H268 L278 32 V360 L268 370 H52 L42 360 V32 Z" stroke="#e0703f" stroke-width="1.2" stroke-dasharray="2 6" opacity="',
            legendary ? "1" : "0",
            '"/></g><g fill="',
            col,
            '" opacity="',
            legendary ? "1" : "0",
            '"><circle cx="48" cy="28" r="3"/><circle cx="272" cy="28" r="3"/><circle cx="48" cy="356" r="3"/><circle cx="272" cy="356" r="3"/></g>'
        );
    }

    function _plate(string[5] memory c, bool pending) private pure returns (string memory) {
        string memory op = pending ? ".35" : "1";
        return string.concat(
            '<path d="M70 40 H250 L260 50 V342 L250 352 H70 L60 342 V50 Z" fill="#0a0a0b" transform="translate(7 9)" opacity="',
            op,
            '"/><path d="M70 40 H250 L260 50 V342 L250 352 H70 L60 342 V50 Z" fill="',
            c[0],
            '" opacity="',
            op,
            '" stroke="',
            c[1],
            '" stroke-width="1.5"',
            pending ? ' stroke-dasharray="6 6"' : "",
            "/>"
        );
    }

    function _inlay(string[5] memory c, uint8[5] memory t, uint256 n, bool legendary) private pure returns (string memory) {
        return string.concat(
            '<g clip-path="url(#pc)"><path d="M60 300 L260 150 V360 H60 Z" fill="',
            c[1],
            '" opacity=".12"/><path d="M66 46 H254" stroke="',
            c[2],
            '" stroke-width="2" opacity=".75"/><path d="M66 46 V346" stroke="',
            c[2],
            '" stroke-width="2" opacity=".45"/><rect x="72" y="56" width="14" height="284" fill="url(#pt)"/><rect x="234" y="56" width="14" height="284" fill="url(#pt)"/><path d="M90 56 V340 M230 56 V340" stroke="',
            c[3],
            '" stroke-width="1" opacity=".55"/><rect x="96" y="66" width="34" height="34" fill="',
            c[1],
            '" opacity=".55"/><rect x="96" y="66" width="34" height="34" fill="none" stroke="',
            c[3],
            '" stroke-width="1.2"/><text x="113" y="91" text-anchor="middle" font-family="Georgia, serif" font-size="25" fill="',
            c[4],
            '">',
            sectionLetter(n),
            '</text><path d="M98 316 H222" stroke="#e0703f" stroke-width="2" opacity="',
            legendary ? "1" : "0",
            '"/></g>',
            _marks(c[3], t, n)
        );
    }

    function _marks(string memory eng, uint8[5] memory t, uint256 n) private pure returns (string memory) {
        return string.concat(
            '<g transform="translate(110 132)" fill="none" stroke="',
            eng,
            '" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" style="color:',
            eng,
            '">',
            PlateParts.emblem(t[1]),
            '</g><text x="160" y="300" text-anchor="middle" font-family="Georgia, serif" font-size="26" letter-spacing="4" fill="',
            eng,
            '">',
            greek(n),
            '</text><g transform="translate(184 66)" fill="none" stroke="',
            eng,
            '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:',
            eng,
            '">',
            PlateParts.seal(t[3]),
            "</g>"
        );
    }

    function _ball() private pure returns (string memory) {
        return '<g><circle cx="160" cy="196" r="12" fill="#f4f1ea"/><path d="M160 120 V160" stroke="#f4f1ea" stroke-width="2" stroke-dasharray="3 5"/></g>';
    }

    function _caption(uint256 n, bool pending, uint8 frame) private pure returns (string memory) {
        string memory tag = pending ? "BEING DRAWN" : frame == Traits.FRAME_LEGENDARY ? "LEGENDARY" : frame == Traits.FRAME_RARE ? "RARE" : "";
        string memory tagColor = pending ? "#d6d3cc" : frame == Traits.FRAME_LEGENDARY ? "#e2b65a" : "#79b8d6";
        return string.concat(
            '<text x="30" y="386" font-family="monospace" font-size="12" letter-spacing="1.5" fill="#d6d3cc">LOT #',
            n.toString(),
            '</text><text x="290" y="386" text-anchor="end" font-family="monospace" font-size="10.5" letter-spacing="2" fill="',
            tagColor,
            '">',
            tag,
            "</text></svg>"
        );
    }

    // ---------------------------------------------------------------- metadata

    function tokenURI(uint256 tokenId, uint256 requestId, bool finalized, bool isFloor, uint8[5] memory t)
        external
        pure
        returns (string memory)
    {
        string memory image = Base64.encode(bytes(svg(t, !finalized, tokenId)));
        string memory attrs = finalized ? _attributes(t, isFloor) : '[{"trait_type":"Status","value":"Being drawn"}]';
        string memory json = string.concat(
            '{"name":"Sortes Lot #', tokenId.toString(),
            '","description":"A Sortes Lot: a bronze allotment plate whose metal, emblem, border, seal and frame come from a fair draw on QoreChain (request #',
            requestId.toString(),
            '). Verify it at /verify.","image":"data:image/svg+xml;base64,', image,
            '","attributes":', attrs, "}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _attributes(uint8[5] memory t, bool isFloor) private pure returns (string memory out) {
        out = "[";
        for (uint256 i; i < Traits.COUNT; ++i) {
            out = string.concat(out, '{"trait_type":"', traitName(i), '","value":"', variantName(i, t[i]), '"},');
        }
        out = string.concat(out, '{"trait_type":"Outcome","value":"', isFloor ? "Floor (timeout)" : "Fair roll", '"}]');
    }
}
