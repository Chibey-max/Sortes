// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice QoreChain post-quantum precompiles (ABI from @qorechain/evm 0.14.0).
/// `pqcVerify` lives at 0x...0a01 and `pqcKeyStatus` at 0x...0a02; both are active on
/// qorechain-diana (checked in `active_static_precompiles` on day 0).
interface IQorePQC {
    /// @dev FIPS-204 ML-DSA verification over the raw `message` bytes, empty context.
    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        view
        returns (bool valid);

    /// @dev The key registered on the native lane for `account`. algorithmId 1 = Dilithium-5 (ML-DSA-87).
    function pqcKeyStatus(address account)
        external
        view
        returns (bool registered, uint8 algorithmId, bytes memory pubkey);
}
