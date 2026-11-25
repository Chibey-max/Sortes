import { CONFIG } from "@/lib/config";

const EXAMPLE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISortesHouse {
    enum Status { None, Requested, HouseRevealed, Fulfilled, HouseTimedOut, UserTimedOut }
    function request(bytes32 commit, address beneficiary) external payable returns (uint256);
    function resultOf(uint256 id) external view returns (Status, bytes32);
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

export default function Build() {
  return (
    <>
      <h1>Build with Sortes</h1>
      <p className="lead">Any QoreChain app adds fair randomness by opening a request and reading the result. The house reveals; your app (or the user) reveals the secret; anyone can settle a timeout.</p>
      <section className="card">
        <h2>Deployed on diana (chain 9800)</h2>
        <table className="small">
          <tbody>
            <tr><td>SortesHouse</td><td className="mono">{CONFIG.house}</td></tr>
            <tr><td>SortesMint</td><td className="mono">{CONFIG.mint}</td></tr>
            <tr><td>SortesDice</td><td className="mono">{CONFIG.dice}</td></tr>
            <tr><td>Fee</td><td>1 QOR per request; 2 QOR penalty to the user if the house is silent</td></tr>
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>About ten lines</h2>
        <pre className="code">{EXAMPLE}</pre>
      </section>
      <section className="card">
        <h2>The rules your app inherits</h2>
        <ul className="small">
          <li><span className="mono">commit = keccak256(abi.encode(&quot;SORTES-COMMIT-v1&quot;, secret, beneficiary, consumer, chainId))</span></li>
          <li><span className="mono">result = keccak256(abi.encode(&quot;SORTES-RESULT-v1&quot;, houseValue, secret, lockHash, requestId, house, chainId))</span></li>
          <li>The house must reveal within 100 blocks of the lock block (2 blocks after the request), the user within 150 blocks of the house reveal.</li>
          <li>A timeout always means the floor: treat it as the worst outcome for whoever was silent, never as a re-roll.</li>
          <li>Full guide: <span className="mono">docs/INTEGRATION.md</span> in the repository.</li>
        </ul>
      </section>
    </>
  );
}
