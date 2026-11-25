// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Traits} from "./lib/Traits.sol";

/// @title SortesRenderer
/// @notice Builds token metadata and SVG art fully on chain from trait values. No IPFS: the art
/// can be rebuilt from the chain alone. Kept apart from SortesMint to stay under the size limit.
contract SortesRenderer {
    using Strings for uint256;

    string[4] internal TIER_NAMES = ["Common", "Uncommon", "Rare", "Legendary"];
    string[5] internal TRAIT_NAMES = ["Background", "Shape", "Pattern", "Eyes", "Aura"];

    // ---------------------------------------------------------------- names

    function variantName(uint256 trait, uint8 tier, uint8 variant) public pure returns (string memory) {
        uint256 k = uint256(tier) * 4 + variant;
        if (trait == 0) {
            return _pick(k, ["Chalk", "Sand", "Mist", "Clay", "Teal", "Plum", "Rust", "", "Midnight", "Forest", "", "", "Aurora", "Void", "", ""]);
        }
        if (trait == 1) {
            return _pick(k, ["Circle", "Square", "Diamond", "Pill", "Hexagon", "Triangle", "Shield", "", "Star", "Ring", "", "", "Crown", "Rune", "", ""]);
        }
        if (trait == 2) {
            return _pick(k, ["Plain", "Dots", "Stripes", "Grid", "Waves", "Checks", "Rays", "", "Spiral", "Lattice", "", "", "Glyphs", "Prism", "", ""]);
        }
        if (trait == 3) {
            return _pick(k, ["Calm", "Sleepy", "Wide", "Wink", "Starry", "Hearts", "Sharp", "", "Cyclops", "Visor", "", "", "Oracle", "Third Eye", "", ""]);
        }
        return _pick(k, ["None", "Faint", "Haze", "Glow", "Halo", "Spark", "Ember", "", "Ring", "Pulse", "", "", "Corona", "Eclipse", "", ""]);
    }

    function _pick(uint256 k, string[16] memory names) internal pure returns (string memory) {
        return names[k];
    }

    // ---------------------------------------------------------------- palette

    function _bg(uint8 tier, uint8 v) internal pure returns (string memory, string memory) {
        uint256 k = uint256(tier) * 4 + v;
        string[16] memory a = ["#f4f1ea", "#efe3c8", "#dfe6ea", "#e8d5c4", "#cfe8e3", "#e3d4ea", "#f0d1bf", "", "#1d2440", "#173a2c", "", "", "#2b1052", "#050507", "", ""];
        string[16] memory b = ["#e4ded2", "#dcc9a3", "#c6d1d8", "#d4b9a2", "#9fd3c8", "#c7a9d6", "#e0a385", "", "#3a4a7a", "#2f6b51", "", "", "#1fa0a0", "#2a2a33", "", ""];
        return (a[k], b[k]);
    }

    function _ink(uint8 bgTier) internal pure returns (string memory) {
        return bgTier >= Traits.RARE ? "#f5f5f4" : "#1c1917";
    }

    function _accent(uint8 tier) internal pure returns (string memory) {
        if (tier == Traits.LEGENDARY) return "#f5b301";
        if (tier == Traits.RARE) return "#7c3aed";
        if (tier == Traits.UNCOMMON) return "#0e7490";
        return "#78716c";
    }

    // ---------------------------------------------------------------- art

    function svg(Traits.Set memory s, bool pending, uint256 requestId) public pure returns (string memory) {
        if (pending) return _pendingSvg(requestId);
        (string memory c1, string memory c2) = _bg(s.tier[0], s.variant[0]);
        string memory ink = _ink(s.tier[0]);
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="', c1,
            '"/><stop offset="1" stop-color="', c2, '"/></linearGradient></defs>',
            '<rect width="400" height="400" fill="url(#g)"/>',
            _pattern(s.tier[2], s.variant[2], ink),
            _aura(s.tier[4], s.variant[4]),
            _shape(s.tier[1], s.variant[1], _accent(s.tier[1])),
            _eyes(s.tier[3], s.variant[3]),
            "</svg>"
        );
    }

    function _pendingSvg(uint256 requestId) internal pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#1c1917"/>',
            '<circle cx="200" cy="180" r="70" fill="none" stroke="#a8a29e" stroke-width="6" stroke-dasharray="12 10"/>',
            '<text x="200" y="300" font-family="monospace" font-size="22" fill="#f5f5f4" text-anchor="middle">revealing</text>',
            '<text x="200" y="332" font-family="monospace" font-size="16" fill="#a8a29e" text-anchor="middle">request #',
            requestId.toString(),
            "</text></svg>"
        );
    }

    function _pattern(uint8 tier, uint8 v, string memory ink) internal pure returns (string memory) {
        uint256 k = uint256(tier) * 4 + v;
        string memory o = string.concat('<g fill="none" stroke="', ink, '" stroke-opacity="0.14" stroke-width="3">');
        if (k == 0) return "";
        if (k == 1) return string.concat('<g fill="', ink, '" fill-opacity="0.12"><circle cx="60" cy="60" r="8"/><circle cx="340" cy="60" r="8"/><circle cx="60" cy="340" r="8"/><circle cx="340" cy="340" r="8"/><circle cx="200" cy="40" r="6"/><circle cx="200" cy="360" r="6"/></g>');
        if (k == 2) return string.concat(o, '<path d="M0 80H400M0 160H400M0 240H400M0 320H400"/></g>');
        if (k == 3) return string.concat(o, '<path d="M80 0V400M160 0V400M240 0V400M320 0V400M0 80H400M0 160H400M0 240H400M0 320H400"/></g>');
        if (k == 4) return string.concat(o, '<path d="M0 100Q50 70 100 100T200 100T300 100T400 100M0 300Q50 270 100 300T200 300T300 300T400 300"/></g>');
        if (k == 5) return string.concat('<g fill="', ink, '" fill-opacity="0.08"><rect width="100" height="100"/><rect x="200" width="100" height="100"/><rect x="100" y="100" width="100" height="100"/><rect x="300" y="100" width="100" height="100"/><rect y="200" width="100" height="100"/><rect x="200" y="200" width="100" height="100"/><rect x="100" y="300" width="100" height="100"/><rect x="300" y="300" width="100" height="100"/></g>');
        if (k == 6) return string.concat(o, '<path d="M200 200L0 0M200 200L400 0M200 200L0 400M200 200L400 400M200 200L200 0M200 200L0 200M200 200L400 200M200 200L200 400"/></g>');
        if (k == 8) return string.concat(o, '<path d="M200 200m-20 0a20 20 0 1 1 40 0a40 40 0 1 1 -80 0a60 60 0 1 1 120 0a80 80 0 1 1 -160 0a100 100 0 1 1 200 0"/></g>');
        if (k == 9) return string.concat(o, '<path d="M0 0L400 400M100 0L400 300M0 100L300 400M400 0L0 400M300 0L0 300M400 100L100 400"/></g>');
        if (k == 12) return string.concat('<g fill="#f5b301" fill-opacity="0.35" font-family="monospace" font-size="28"><text x="30" y="60">&#x16A0;</text><text x="330" y="60">&#x16B1;</text><text x="30" y="370">&#x16C7;</text><text x="330" y="370">&#x16DF;</text></g>');
        return '<g fill-opacity="0.18"><path d="M0 400L200 0L400 400Z" fill="#ef4444"/><path d="M0 400L200 0L400 400Z" fill="#3b82f6" transform="rotate(120 200 260)"/><path d="M0 400L200 0L400 400Z" fill="#22c55e" transform="rotate(240 200 260)"/></g>';
    }

    function _aura(uint8 tier, uint8 v) internal pure returns (string memory) {
        uint256 k = uint256(tier) * 4 + v;
        if (k == 0) return "";
        string memory col = _accent(tier);
        string memory op = tier == Traits.COMMON ? "0.25" : tier == Traits.UNCOMMON ? "0.4" : "0.7";
        uint256 r = 120 + uint256(tier) * 12 + uint256(v) * 6;
        string memory ring = string.concat(
            '<circle cx="200" cy="200" r="', r.toString(), '" fill="none" stroke="', col,
            '" stroke-opacity="', op, '" stroke-width="', (tier >= Traits.RARE ? "10" : "5"), '"'
        );
        if (tier == Traits.LEGENDARY && v == 1) {
            return string.concat(ring, ' stroke-dasharray="2 14"/><circle cx="200" cy="200" r="150" fill="#000" fill-opacity="0.25"/>');
        }
        if (tier >= Traits.RARE) {
            return string.concat(ring, '/><circle cx="200" cy="200" r="', (r + 18).toString(), '" fill="none" stroke="', col, '" stroke-opacity="0.3" stroke-width="3"/>');
        }
        return string.concat(ring, "/>");
    }

    function _shape(uint8 tier, uint8 v, string memory col) internal pure returns (string memory) {
        uint256 k = uint256(tier) * 4 + v;
        string memory f = string.concat(' fill="', col, '" stroke="#1c1917" stroke-width="4"/>');
        if (k == 0) return string.concat('<circle cx="200" cy="200" r="100"', f);
        if (k == 1) return string.concat('<rect x="110" y="110" width="180" height="180" rx="18"', f);
        if (k == 2) return string.concat('<path d="M200 90L310 200L200 310L90 200Z"', f);
        if (k == 3) return string.concat('<rect x="90" y="130" width="220" height="140" rx="70"', f);
        if (k == 4) return string.concat('<path d="M200 95L291 147V253L200 305L109 253V147Z"', f);
        if (k == 5) return string.concat('<path d="M200 90L315 300H85Z"', f);
        if (k == 6) return string.concat('<path d="M110 110H290V210Q290 280 200 310Q110 280 110 210Z"', f);
        if (k == 8) return string.concat('<path d="M200 85L228 165L312 165L244 214L270 295L200 246L130 295L156 214L88 165L172 165Z"', f);
        if (k == 9) return string.concat('<circle cx="200" cy="200" r="105" fill="#e7e5e4" stroke="', col, '" stroke-width="40"/>');
        if (k == 12) return string.concat('<path d="M100 290V140L150 195L200 110L250 195L300 140V290Z"', f);
        return string.concat('<path d="M200 90V310M130 140L270 260M270 140L130 260M150 100H250"', ' fill="none" stroke="', col, '" stroke-width="26" stroke-linecap="round"/>');
    }

    function _eyes(uint8 tier, uint8 v) internal pure returns (string memory) {
        uint256 k = uint256(tier) * 4 + v;
        string memory g = '<g fill="#1c1917" stroke="#1c1917">';
        if (k == 0) return string.concat(g, '<circle cx="170" cy="195" r="10"/><circle cx="230" cy="195" r="10"/></g>');
        if (k == 1) return string.concat(g, '<path d="M155 198H185M215 198H245" stroke-width="6" stroke-linecap="round"/></g>');
        if (k == 2) return string.concat(g, '<circle cx="170" cy="195" r="16" fill="#fff" stroke-width="4"/><circle cx="230" cy="195" r="16" fill="#fff" stroke-width="4"/><circle cx="170" cy="195" r="7"/><circle cx="230" cy="195" r="7"/></g>');
        if (k == 3) return string.concat(g, '<circle cx="170" cy="195" r="10"/><path d="M215 197H245" stroke-width="6" stroke-linecap="round"/></g>');
        if (k == 4) return '<g fill="#fde047" stroke="#1c1917" stroke-width="2"><path d="M170 180l5 10l11 2l-8 8l2 11l-10-5l-10 5l2-11l-8-8l11-2Z"/><path d="M230 180l5 10l11 2l-8 8l2 11l-10-5l-10 5l2-11l-8-8l11-2Z"/></g>';
        if (k == 5) return '<g fill="#e11d48"><path d="M170 210l-14-14a8 8 0 0 1 14-10a8 8 0 0 1 14 10Z"/><path d="M230 210l-14-14a8 8 0 0 1 14-10a8 8 0 0 1 14 10Z"/></g>';
        if (k == 6) return string.concat(g, '<path d="M150 185L190 200L150 205ZM250 185L210 200L250 205Z" stroke-width="2"/></g>');
        if (k == 8) return string.concat(g, '<circle cx="200" cy="195" r="26" fill="#fff" stroke-width="5"/><circle cx="200" cy="195" r="11"/></g>');
        if (k == 9) return '<rect x="140" y="180" width="120" height="30" rx="15" fill="#0ea5e9" stroke="#1c1917" stroke-width="4"/>';
        if (k == 12) return '<g><circle cx="170" cy="195" r="14" fill="#f5b301"/><circle cx="230" cy="195" r="14" fill="#f5b301"/><circle cx="170" cy="195" r="5" fill="#1c1917"/><circle cx="230" cy="195" r="5" fill="#1c1917"/></g>';
        return string.concat(g, '<circle cx="170" cy="200" r="9"/><circle cx="230" cy="200" r="9"/><path d="M200 150l14 14l-14 14l-14-14Z" fill="#a855f7" stroke-width="3"/></g>');
    }

    // ---------------------------------------------------------------- metadata

    function tokenURI(uint256 tokenId, uint256 requestId, bool finalized, bool isFloor, Traits.Set memory s)
        external
        view
        returns (string memory)
    {
        string memory image = Base64.encode(bytes(svg(s, !finalized, requestId)));
        string memory attrs = finalized ? _attributes(s, isFloor) : '[{"trait_type":"Status","value":"Revealing"}]';
        string memory json = string.concat(
            '{"name":"Sortes Lot #', tokenId.toString(),
            '","description":"A Sortes Lot. Its traits come from Sortes fair randomness on QoreChain (request #',
            requestId.toString(),
            '). Verify it at /verify.","image":"data:image/svg+xml;base64,', image,
            '","attributes":', attrs, "}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _attributes(Traits.Set memory s, bool isFloor) internal view returns (string memory out) {
        out = "[";
        for (uint256 i; i < Traits.COUNT; ++i) {
            out = string.concat(
                out, '{"trait_type":"', TRAIT_NAMES[i], '","value":"', variantName(i, s.tier[i], s.variant[i]),
                '"},{"trait_type":"', TRAIT_NAMES[i], ' Tier","value":"', TIER_NAMES[s.tier[i]], '"},'
            );
        }
        out = string.concat(out, '{"trait_type":"Outcome","value":"', isFloor ? "Floor (timeout)" : "Fair roll", '"}]');
    }
}
