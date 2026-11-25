// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IQorePQC} from "./interfaces/IQorePQC.sol";
import {ISortesHouse} from "./interfaces/ISortesHouse.sol";

/// @title SortesHouse
/// @notice Fair randomness for QoreChain apps from three inputs: a house value fixed in advance
/// by a keccak256 hash chain, a secret the user committed first, and the hash of the lock block
/// when the chain serves one. Whoever stays silent gets the floor result. Every action that moves
/// the house's money needs a fresh ML-DSA-87 signature checked on chain by `pqcVerify`.
contract SortesHouse is ISortesHouse, ReentrancyGuard {
    // ---------------------------------------------------------------- constants

    address public constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;
    address public constant PQC_KEY_STATUS = 0x0000000000000000000000000000000000000a02;
    /// @dev Dilithium-5 (ML-DSA-87) in QoreChain's x/pqc numbering.
    uint8 public constant ALGORITHM_ML_DSA_87 = 1;

    bytes32 public constant ACTION_ENROLL = keccak256("ENROLL");
    bytes32 public constant ACTION_WITHDRAW = keccak256("WITHDRAW");
    bytes32 public constant ACTION_SET_PAYOUT = keccak256("SET_PAYOUT");
    bytes32 public constant ACTION_ROTATE = keccak256("ROTATE_ANCHOR");
    bytes32 public constant ACTION_SET_ACCEPTING = keccak256("SET_ACCEPTING");

    // ---------------------------------------------------------------- parameters

    address public immutable house;
    uint256 public immutable LOCK_DELAY;
    uint256 public immutable W_HOUSE;
    uint256 public immutable W_USER;
    uint256 public immutable MAX_SKIP;
    uint256 public immutable FEE;
    uint256 public immutable PENALTY;
    uint256 public immutable MIN_BOND;

    // ---------------------------------------------------------------- state

    struct Request {
        address consumer;
        address beneficiary;
        bytes32 commit;
        uint64 position;
        uint64 requestBlock;
        uint64 lockBlock;
        uint64 houseRevealBlock;
        Status status;
        uint128 fee;
        bytes32 houseValue;
        bytes32 lockHash;
        bytes32 result;
    }

    address public payout;
    bytes32 public anchor;
    uint64 public chainLength;
    uint64 public nextPosition;
    uint64 public lastPos;
    bytes32 public lastVal;

    uint256 public bond;
    uint256 public earned;
    uint256 public openRequests;
    /// @notice Sum of fees held for requests that are not final yet.
    uint256 public heldFees;
    /// @notice Payments a recipient could not take at once; claim with `claimOwed`.
    mapping(address => uint256) public owed;
    uint256 public totalOwed;

    uint256 public adminNonce;
    bool public accepting;
    bool public enrolled;

    uint256 public requestCount;
    mapping(uint256 => Request) internal _requests;

    // ---------------------------------------------------------------- events

    event Enrolled(bytes32 anchor, uint64 chainLength, uint256 bond);
    event Requested(uint256 indexed id, address indexed consumer, address indexed beneficiary, uint64 position, uint64 lockBlock);
    event HouseRevealed(uint256 indexed id, bytes32 value, bytes32 lockHash);
    event Fulfilled(uint256 indexed id, bytes32 result);
    event TimedOut(uint256 indexed id, Status status);
    event Checkpoint(uint64 position, bytes32 value);
    event BondAdded(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event PayoutChanged(address payout);
    event AnchorRotated(bytes32 anchor, uint64 chainLength);
    event AcceptingChanged(bool accepting);
    event Owed(address indexed to, uint256 amount);

    // ---------------------------------------------------------------- errors

    error NotAccepting();
    error NotEnrolled();
    error AlreadyEnrolled();
    error BadFee();
    error BondTooLow();
    error BadStatus();
    error TooEarly();
    error TooLate();
    error BadReveal();
    error SkipTooFar();
    error BadSecret();
    error KeyNotRegistered();
    error KeyNotProven();
    error BadPqcSignature();
    error OpenRequests();
    error ChainExhausted();
    error BadParams();
    error TransferFailed();

    // ---------------------------------------------------------------- setup

    constructor(
        address house_,
        address payout_,
        uint256 lockDelay,
        uint256 wHouse,
        uint256 wUser,
        uint256 maxSkip,
        uint256 fee,
        uint256 penalty,
        uint256 minBond
    ) {
        if (house_ == address(0) || payout_ == address(0)) revert BadParams();
        if (lockDelay == 0 || wHouse == 0 || wUser == 0 || maxSkip == 0) revert BadParams();
        if (fee > type(uint128).max) revert BadParams();
        house = house_;
        payout = payout_;
        LOCK_DELAY = lockDelay;
        W_HOUSE = wHouse;
        W_USER = wUser;
        MAX_SKIP = maxSkip;
        FEE = fee;
        PENALTY = penalty;
        MIN_BOND = minBond;
    }

    /// @notice Post the hash-chain anchor and the bond. Authorised by an ML-DSA-87 signature
    /// from the house account's registered key, so a stolen ECDSA key cannot enroll a chain.
    function enroll(bytes32 anchor_, uint64 n, bytes calldata sig) external payable nonReentrant {
        if (enrolled) revert AlreadyEnrolled();
        if (anchor_ == bytes32(0) || n == 0) revert BadParams();
        if (msg.value < MIN_BOND) revert BondTooLow();
        _requirePqc(ACTION_ENROLL, abi.encode(anchor_, n, msg.value), sig);

        enrolled = true;
        accepting = true;
        _setChain(anchor_, n);
        bond = msg.value;
        emit Enrolled(anchor_, n, msg.value);
        emit AcceptingChanged(true);
    }

    /// @notice Anyone may add to the bond.
    function addBond() external payable {
        if (!enrolled) revert NotEnrolled();
        bond += msg.value;
        emit BondAdded(msg.sender, msg.value);
    }

    // ---------------------------------------------------------------- request flow

    /// @inheritdoc ISortesHouse
    function request(bytes32 commit, address beneficiary) external payable nonReentrant returns (uint256 id) {
        if (!accepting) revert NotAccepting();
        if (msg.value != FEE) revert BadFee();
        if (beneficiary == address(0) || commit == bytes32(0)) revert BadParams();
        if (nextPosition > chainLength) revert ChainExhausted();
        if (bond < (openRequests + 1) * PENALTY) revert BondTooLow();

        id = ++requestCount;
        uint64 position = nextPosition++;
        uint64 lockBlock = uint64(block.number + LOCK_DELAY);

        Request storage r = _requests[id];
        r.consumer = msg.sender;
        r.beneficiary = beneficiary;
        r.commit = commit;
        r.position = position;
        r.requestBlock = uint64(block.number);
        r.lockBlock = lockBlock;
        r.fee = uint128(msg.value);
        r.status = Status.Requested;

        openRequests++;
        heldFees += msg.value;
        emit Requested(id, msg.sender, beneficiary, position, lockBlock);
    }

    /// @notice Post the house's chain value for a request. Anyone may send it (normally the
    /// daemon): only the true preimage passes the chain check.
    function revealHouse(uint256 id, bytes32 value) external {
        Request storage r = _requests[id];
        if (r.status != Status.Requested) revert BadStatus();
        if (block.number <= r.lockBlock) revert TooEarly();
        if (block.number > r.lockBlock + W_HOUSE) revert TooLate();
        _acceptChainValue(r.position, value);

        // Zero when the chain serves no block hashes (qorechain-diana on day 0) or the lock
        // block is older than 256 blocks. Kept in the formula so the result picks up a third
        // input wherever the chain provides one; see the trust model in docs/THREAT_MODEL.md.
        bytes32 lockHash = blockhash(r.lockBlock);
        r.houseValue = value;
        r.lockHash = lockHash;
        r.houseRevealBlock = uint64(block.number);
        r.status = Status.HouseRevealed;
        emit HouseRevealed(id, value, lockHash);
    }

    /// @notice Post the user's secret and fix the result. Anyone may send it (normally the app).
    function revealUser(uint256 id, bytes32 secret) external {
        Request storage r = _requests[id];
        if (r.status != Status.HouseRevealed) revert BadStatus();
        if (block.number > r.houseRevealBlock + W_USER) revert TooLate();
        if (commitmentOf(secret, r.beneficiary, r.consumer) != r.commit) revert BadSecret();

        bytes32 result = resultFrom(r.houseValue, secret, r.lockHash, id);
        r.result = result;
        r.status = Status.Fulfilled;
        _close(r.fee);
        earned += r.fee;
        emit Fulfilled(id, result);
    }

    /// @notice Settle a request whose deadline passed. Anyone may call.
    /// A silent house pays the fee back plus a penalty from the bond; a silent user leaves the
    /// fee with the house. Either way the request ends with the floor result (`result` = 0).
    function claimTimeout(uint256 id) external nonReentrant {
        Request storage r = _requests[id];
        if (r.status == Status.Requested) {
            if (block.number <= r.lockBlock + W_HOUSE) revert TooEarly();
            r.status = Status.HouseTimedOut;
            uint256 penalty = PENALTY <= bond ? PENALTY : bond;
            bond -= penalty;
            _close(r.fee);
            emit TimedOut(id, Status.HouseTimedOut);
            _pay(r.beneficiary, uint256(r.fee) + penalty);
        } else if (r.status == Status.HouseRevealed) {
            if (block.number <= r.houseRevealBlock + W_USER) revert TooEarly();
            r.status = Status.UserTimedOut;
            _close(r.fee);
            earned += r.fee;
            emit TimedOut(id, Status.UserTimedOut);
        } else {
            revert BadStatus();
        }
    }

    /// @notice Move the chain checkpoint forward over positions whose requests ended without a
    /// house reveal, so a later reveal never needs more than MAX_SKIP hashes. Only assigned
    /// positions can be revealed, so the value of any future request stays secret.
    function checkpoint(uint64 position, bytes32 value) external {
        if (position <= lastPos || position >= nextPosition) revert BadParams();
        _acceptChainValue(position, value);
        emit Checkpoint(position, value);
    }

    /// @notice Take a payment that could not be pushed earlier.
    function claimOwed() external nonReentrant {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert BadParams();
        owed[msg.sender] = 0;
        totalOwed -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ---------------------------------------------------------------- ML-DSA-gated admin

    /// @notice Withdraw earned fees first, then any bond above what open requests need.
    function withdraw(uint256 amount, bytes calldata sig) external nonReentrant {
        _requirePqc(ACTION_WITHDRAW, abi.encode(amount), sig);
        uint256 cover = openRequests * PENALTY;
        uint256 freeBond = bond > cover ? bond - cover : 0;
        if (amount == 0 || amount > earned + freeBond) revert BondTooLow();
        uint256 fromEarned = amount <= earned ? amount : earned;
        earned -= fromEarned;
        bond -= amount - fromEarned;
        emit Withdrawn(payout, amount);
        (bool ok,) = payout.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function setPayout(address newPayout, bytes calldata sig) external {
        if (newPayout == address(0)) revert BadParams();
        _requirePqc(ACTION_SET_PAYOUT, abi.encode(newPayout), sig);
        payout = newPayout;
        emit PayoutChanged(newPayout);
    }

    function rotateAnchor(bytes32 newAnchor, uint64 n, bytes calldata sig) external {
        if (!enrolled) revert NotEnrolled();
        if (newAnchor == bytes32(0) || n == 0) revert BadParams();
        if (openRequests != 0) revert OpenRequests();
        _requirePqc(ACTION_ROTATE, abi.encode(newAnchor, n), sig);
        _setChain(newAnchor, n);
        emit AnchorRotated(newAnchor, n);
    }

    function setAccepting(bool on, bytes calldata sig) external {
        if (!enrolled) revert NotEnrolled();
        _requirePqc(ACTION_SET_ACCEPTING, abi.encode(on), sig);
        accepting = on;
        emit AcceptingChanged(on);
    }

    // ---------------------------------------------------------------- views

    /// @inheritdoc ISortesHouse
    function resultOf(uint256 id) external view returns (Status status, bytes32 result) {
        Request storage r = _requests[id];
        return (r.status, r.result);
    }

    function getRequest(uint256 id) external view returns (Request memory) {
        return _requests[id];
    }

    /// @notice The 32-byte digest an ML-DSA-87 admin signature must cover.
    /// `params` is the abi.encode of the action's arguments; the digest binds the action, chain,
    /// this contract, the house account and the current nonce, so no signature is reusable.
    function adminDigest(bytes32 action, bytes memory params) public view returns (bytes32) {
        return keccak256(
            abi.encode("SORTES-ADMIN-v1", action, block.chainid, address(this), house, keccak256(params), adminNonce)
        );
    }

    function commitmentOf(bytes32 secret, address beneficiary, address consumer) public view returns (bytes32) {
        return keccak256(abi.encode("SORTES-COMMIT-v1", secret, beneficiary, consumer, block.chainid));
    }

    function resultFrom(bytes32 houseValue, bytes32 secret, bytes32 lockHash, uint256 id) public view returns (bytes32) {
        return keccak256(abi.encode("SORTES-RESULT-v1", houseValue, secret, lockHash, id, address(this), block.chainid));
    }

    /// @notice Request deadlines: the last block the house may reveal, and (once it has) the
    /// last block the user may reveal.
    function deadlines(uint256 id) external view returns (uint256 houseDeadline, uint256 userDeadline) {
        Request storage r = _requests[id];
        houseDeadline = uint256(r.lockBlock) + W_HOUSE;
        userDeadline = r.houseRevealBlock == 0 ? 0 : uint256(r.houseRevealBlock) + W_USER;
    }

    // ---------------------------------------------------------------- internals

    function _setChain(bytes32 anchor_, uint64 n) internal {
        anchor = anchor_;
        chainLength = n;
        nextPosition = 1;
        lastPos = 0;
        lastVal = anchor_;
    }

    /// @dev Accept `value` as v[position] if it hashes forward to the checkpoint (higher
    /// position, at most MAX_SKIP steps) or equals the value derived from it (lower position).
    function _acceptChainValue(uint64 position, bytes32 value) internal {
        if (position > lastPos) {
            uint256 steps = position - lastPos;
            if (steps > MAX_SKIP) revert SkipTooFar();
            bytes32 h = value;
            for (uint256 i; i < steps; ++i) {
                h = keccak256(abi.encodePacked(h));
            }
            if (h != lastVal) revert BadReveal();
            lastPos = position;
            lastVal = value;
        } else {
            bytes32 h = lastVal;
            for (uint256 i = position; i < lastPos; ++i) {
                h = keccak256(abi.encodePacked(h));
            }
            if (h != value) revert BadReveal();
        }
    }

    function _close(uint256 fee) internal {
        openRequests--;
        heldFees -= fee;
    }

    function _pay(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount, gas: 50_000}("");
        if (!ok) {
            owed[to] += amount;
            totalOwed += amount;
            emit Owed(to, amount);
        }
    }

    /// @dev Read the house key from pqcKeyStatus and check an ML-DSA-87 signature over the
    /// admin digest with pqcVerify. Increments the nonce on success.
    function _requirePqc(bytes32 action, bytes memory params, bytes calldata sig) internal {
        (bool ok, bytes memory ret) =
            PQC_KEY_STATUS.staticcall(abi.encodeCall(IQorePQC.pqcKeyStatus, (house)));
        if (!ok || ret.length < 96) revert KeyNotRegistered();
        (bool registered, uint8 algorithmId, bytes memory pubkey) = abi.decode(ret, (bool, uint8, bytes));
        if (!registered || pubkey.length == 0) revert KeyNotRegistered();
        if (algorithmId != ALGORITHM_ML_DSA_87) revert KeyNotProven();

        bytes32 digest = adminDigest(action, params);
        (ok, ret) = PQC_VERIFY.staticcall(
            abi.encodeCall(IQorePQC.pqcVerify, (pubkey, sig, abi.encodePacked(digest)))
        );
        if (!ok || ret.length < 32 || !abi.decode(ret, (bool))) revert BadPqcSignature();
        adminNonce++;
    }
}
