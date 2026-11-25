// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Attack-page evidence: records what the chain offers as "randomness" in a real
/// transaction. On qorechain-diana (day 0) prevrandao was a constant 0xff..ff and blockhash
/// returned zero, so neither can seed a fair outcome.
contract RandomnessProbe {
    event Sample(uint256 indexed blockNumber, uint256 prevrandao, bytes32 blockhashPrev, bytes32 blockhashLock);

    uint256 public samples;

    function record() external {
        samples++;
        emit Sample(block.number, block.prevrandao, blockhash(block.number - 1), blockhash(block.number - 2));
    }
}
