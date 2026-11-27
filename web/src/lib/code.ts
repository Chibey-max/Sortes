/** Tiny Solidity/TypeScript highlighter for the code blocks of the design (keyword, string, comment). */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const KW = /\b(import|from|contract|interface|library|is|function|constructor|external|public|internal|private|payable|view|pure|returns|return|immutable|mapping|enum|if|else|const|await|new|pragma|solidity|struct|event|emit|error|revert|using)\b/g;
const TYPES = /\b(uint256|uint64|uint8|address|bytes32|bytes|bool|string)\b/g;

export function highlight(code: string): string {
  return esc(code)
    .split("\n")
    .map((line) => {
      const ci = line.search(/\/\/(?![^<]*>)/);
      const head = ci >= 0 ? line.slice(0, ci) : line;
      const tail = ci >= 0 ? `<span style="color:#8a8a8a">${line.slice(ci)}</span>` : "";
      const h = head
        .replace(/(&quot;|"[^"]*")/g, (m) => `<span style="color:#b7c99a">${m}</span>`)
        .replace(KW, (m, _k, off, str) => (str.slice(Math.max(0, off - 30), off).includes('style="color') && !str.slice(off - 8, off).includes(">") ? m : `<span style="color:#f0a37a">${m}</span>`))
        .replace(TYPES, (m) => `<span style="color:#f0a37a">${m}</span>`);
      return h + tail;
    })
    .join("\n");
}

export const COINFLIP = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISortesHouse {
    enum Status { None, Requested, HouseRevealed, Fulfilled, HouseTimedOut, UserTimedOut }
    function request(bytes32 commit, address beneficiary) external payable returns (uint256 id);
    function resultOf(uint256 id) external view returns (Status status, bytes32 result);
    function FEE() external view returns (uint256);
}

contract CoinFlip {
    ISortesHouse public immutable house;
    mapping(uint256 => address) public player;
    constructor(ISortesHouse h) { house = h; }

    // commit = house.commitmentOf(secret, msg.sender, address(this)), made in the player's browser
    function flip(bytes32 commit) external payable returns (uint256 id) {
        id = house.request{value: house.FEE()}(commit, msg.sender);
        player[id] = msg.sender;
    }

    function outcome(uint256 id) external view returns (bool done, bool heads) {
        (ISortesHouse.Status s, bytes32 r) = house.resultOf(id);
        if (s == ISortesHouse.Status.Fulfilled) return (true, uint256(r) % 2 == 0);
        if (s == ISortesHouse.Status.HouseTimedOut || s == ISortesHouse.Status.UserTimedOut) return (true, false); // floor
        return (false, false);
    }
}`;

/** The ten lines that matter, for the landing page. */
export const COINFLIP_SHORT = `import {ISortesHouse} from "./ISortesHouse.sol";

contract CoinFlip {
    ISortesHouse public immutable house;
    constructor(ISortesHouse h) { house = h; }

    function flip(bytes32 commit) external payable returns (uint256 id) {
        id = house.request{value: house.FEE()}(commit, msg.sender);
    }

    function heads(uint256 id) external view returns (bool) {
        (, bytes32 r) = house.resultOf(id); // zero = floor
        return uint256(r) % 2 == 0;
    }
}`;
