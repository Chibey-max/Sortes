// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// =====================================================================================
//  TEST MOCKS ONLY. The real precompiles exist on qorechain-diana, not in a local
//  Foundry chain, so tests `vm.etch` these at 0x...0a01 and 0x...0a02. The real
//  ML-DSA-87 path is proven on diana by script/ and the day-0 check (pqcVerify with a
//  real @qorechain/pqc signature returned true; tampered message and wrong key false).
// =====================================================================================

/// @notice Stand-in for pqcVerify at 0x...0a01. A "signature" is valid when it equals
/// keccak256(abi.encode(pubkey, message)), which only the test (holding the pubkey) makes.
contract PqcVerifyMock {
    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        pure
        returns (bool)
    {
        return keccak256(signature) == keccak256(abi.encodePacked(keccak256(abi.encode(pubkey, message))));
    }
}

/// @notice Stand-in for pqcKeyStatus at 0x...0a02, with a test-only setter.
contract PqcKeyStatusMock {
    struct Key {
        bool registered;
        uint8 algorithmId;
        bytes pubkey;
    }

    mapping(address => Key) internal keys;

    function setKey(address account, bool registered, uint8 algorithmId, bytes calldata pubkey) external {
        keys[account] = Key(registered, algorithmId, pubkey);
    }

    function pqcKeyStatus(address account) external view returns (bool, uint8, bytes memory) {
        Key storage k = keys[account];
        return (k.registered, k.algorithmId, k.pubkey);
    }
}

/// @notice Mock signer matching PqcVerifyMock.
library MockSig {
    function sign(bytes memory pubkey, bytes32 digest) internal pure returns (bytes memory) {
        return abi.encodePacked(keccak256(abi.encode(pubkey, abi.encodePacked(digest))));
    }
}
