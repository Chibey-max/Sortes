# Integrating Sortes

Add fair randomness to a QoreChain contract in about ten lines. Your contract opens a request; the house reveals; the user's secret is revealed; you read the result.

## 1. The interface

```solidity
interface ISortesHouse {
    enum Status { None, Requested, HouseRevealed, Fulfilled, HouseTimedOut, UserTimedOut }
    function request(bytes32 commit, address beneficiary) external payable returns (uint256 id);
    function resultOf(uint256 id) external view returns (Status status, bytes32 result);
    function FEE() external view returns (uint256);
    function commitmentOf(bytes32 secret, address beneficiary, address consumer) external view returns (bytes32);
}
```

## 2. Your contract

```solidity
contract CoinFlip {
    ISortesHouse public immutable house;
    mapping(uint256 => address) public player;
    constructor(ISortesHouse h) { house = h; }

    function flip(bytes32 commit) external payable returns (uint256 id) {
        id = house.request{value: house.FEE()}(commit, msg.sender);
        player[id] = msg.sender;
    }

    function outcome(uint256 id) external view returns (bool done, bool heads) {
        (ISortesHouse.Status s, bytes32 r) = house.resultOf(id);
        if (s == ISortesHouse.Status.Fulfilled) return (true, uint256(r) % 2 == 0);
        if (s == ISortesHouse.Status.HouseTimedOut || s == ISortesHouse.Status.UserTimedOut) return (true, false);
        return (false, false);
    }
}
```

The fee is paid to the house per request (1 QOR on the testnet house). `SortesMint` and `SortesDice` in `contracts/src/` are complete examples, including a sponsored path for wallets that cannot send value.

## 3. The user's secret (front end)

```ts
const secret = toHex(crypto.getRandomValues(new Uint8Array(32)));
const commit = keccak256(encodeAbiParameters(
  parseAbiParameters("string, bytes32, address, address, uint256"),
  ["SORTES-COMMIT-v1", secret, userAddress, yourContract, 9800n],
));
// save `secret` BEFORE sending the transaction; offer a backup download
```

`beneficiary` is the user (it receives the refund if the house is silent); `consumer` is your contract (the `msg.sender` the house sees). A commitment made for one pair is useless for another.

## 4. Revealing

After the house reveals (event `HouseRevealed(id, value, lockHash)`, normally within a few blocks), the secret must reach `revealUser(id, secret)` within `W_USER` blocks (150). Three ways:

- POST it to the house daemon's relay: `POST {daemon}/reveal` with `{"id": "<request id>", "secret": "0x…"}`. The daemon checks it against the commitment and sends the transaction. No second wallet signature.
- Send `revealUser` from the user's wallet.
- Send it from your own backend. Anyone may send it; only the right secret passes.

## 5. Rules you inherit

- **A timeout is the floor.** Treat `HouseTimedOut` and `UserTimedOut` as the worst outcome for the silent side, never as a re-roll. If you re-roll on timeout, a silent party can choose results.
- **Deadlines** (testnet house): house within `lockBlock + 100`, user within `houseRevealBlock + 150`; lock block = request block + 2. Blocks are ~1.43 s on diana.
- **Anyone can settle** with `claimTimeout(id)`; build a "settle" button for users.
- **Result formula** (to verify off chain):
  `keccak256(abi.encode("SORTES-RESULT-v1", houseValue, secret, lockHash, requestId, houseContract, chainId))`, with `secret` emitted in `Fulfilled(id, secret, result)`.
- **Trust model:** a result can be chosen only if the house operator and the beneficiary collude (on diana, where contracts get no block hashes). See `docs/THREAT_MODEL.md`.

## 6. QoreX users

QoreX does not send EVM transactions yet. A QoreX user reaches your contract with a native `MsgCrossVMCall` (`window.qorex.native.signAndBroadcast`); your contract sees the user's own 0x address as `msg.sender`, but **no value** arrives. Offer a sponsored entry point that pays the fee from a pool, as `SortesMint.mintSponsored` does. A ready encoder is in `web/src/lib/qorex.ts`.
