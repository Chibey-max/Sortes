// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice What a consumer app needs from a Sortes house.
interface ISortesHouse {
    enum Status {
        None,
        Requested,
        HouseRevealed,
        Fulfilled,
        HouseTimedOut,
        UserTimedOut
    }

    /// @notice Open a request. `msg.value` must equal `FEE()`.
    /// The commitment binds the secret to `beneficiary`, the calling contract and the chain:
    /// keccak256(abi.encode("SORTES-COMMIT-v1", secret, beneficiary, msg.sender, block.chainid)).
    function request(bytes32 commit, address beneficiary) external payable returns (uint256 id);

    /// @notice Status and result of a request. The result is zero until `Fulfilled`.
    function resultOf(uint256 id) external view returns (Status status, bytes32 result);

    function FEE() external view returns (uint256);
}
