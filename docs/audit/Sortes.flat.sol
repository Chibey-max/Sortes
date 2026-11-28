// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// Merged Sortes contracts for the QCAI auditor (dashboard.qorechain.io/audit).
// OpenZeppelin 5.x left as imports. Setting: Ethereum (EVM/Solidity).
// Source files concatenated in dependency order from contracts/src/.

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

// ===== interfaces/IQorePQC.sol =====
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
// ===== interfaces/ISortesHouse.sol =====
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
// ===== lib/Traits.sol =====
/// @title Traits
/// @notice Turns a Sortes result into the five traits of a Lot plate. Each trait rolls
/// independently: `roll = keccak256(abi.encode(result, i)) % 10000`, then the first variant whose
/// cumulative weight (in basis points) exceeds the roll wins.
///
///   0 Metal   bronze 26%, silver 22%, iron 18%, verdigris 14%, black iron 12%, gold 8%
///   1 Emblem  owl 25%, column 22%, amphora 18%, scales 16%, laurel 14%, kleros 5%
///   2 Border  bead and reel 28%, dentil 24%, egg and dart 20%, running wave 16%, meander 12%
///   3 Seal    wheel 30%, double owl 25%, owl in wreath 20%, gorgon 16%, star 9%
///   4 Frame   common 60%, uncommon 26%, rare 10%, legendary 4%   (the lot's tier)
///
/// The floor (a timed-out request) is silver / owl / bead and reel / wheel / common.
library Traits {
    uint256 internal constant COUNT = 5;

    uint8 internal constant FRAME_COMMON = 0;
    uint8 internal constant FRAME_UNCOMMON = 1;
    uint8 internal constant FRAME_RARE = 2;
    uint8 internal constant FRAME_LEGENDARY = 3;

    /// @notice Number of variants of `trait`.
    function variantCount(uint256 trait) internal pure returns (uint256) {
        if (trait == 0 || trait == 1) return 6;
        if (trait == 2 || trait == 3) return 5;
        return 4;
    }

    /// @notice Weight of `variant` of `trait`, in basis points (sums to 10,000 per trait).
    function weightBps(uint256 trait, uint256 variant) internal pure returns (uint256) {
        if (trait == 0) return _w6(variant, [uint16(2600), 2200, 1800, 1400, 1200, 800]);
        if (trait == 1) return _w6(variant, [uint16(2500), 2200, 1800, 1600, 1400, 500]);
        if (trait == 2) return _w5(variant, [uint16(2800), 2400, 2000, 1600, 1200]);
        if (trait == 3) return _w5(variant, [uint16(3000), 2500, 2000, 1600, 900]);
        return _w4(variant, [uint16(6000), 2600, 1000, 400]);
    }

    function derive(bytes32 result) internal pure returns (uint8[5] memory t) {
        for (uint256 i; i < COUNT; ++i) {
            uint256 roll = uint256(keccak256(abi.encode(result, i))) % 10000;
            uint256 n = variantCount(i);
            uint256 acc;
            uint256 pick = n - 1;
            for (uint256 k; k < n; ++k) {
                acc += weightBps(i, k);
                if (roll < acc) {
                    pick = k;
                    break;
                }
            }
            t[i] = uint8(pick);
        }
    }

    /// @notice silver, owl, bead and reel, wheel, common.
    function floor() internal pure returns (uint8[5] memory t) {
        t[0] = 1;
    }

    function _w6(uint256 v, uint16[6] memory w) private pure returns (uint256) {
        return w[v];
    }

    function _w5(uint256 v, uint16[5] memory w) private pure returns (uint256) {
        return w[v];
    }

    function _w4(uint256 v, uint16[4] memory w) private pure returns (uint256) {
        return w[v];
    }
}
// ===== lib/PlateParts.sol =====
/// @title PlateParts
/// @notice SVG fragments for a Sortes Lot plate: six emblems, five seals, five border patterns.
/// GENERATED from the Sortes design (LotArt component); do not edit by hand.
library PlateParts {
    function emblem(uint8 i) internal pure returns (string memory) {
        if (i == 0) return '<path d="M50 14 C31 14 23 30 25 47 C27 70 37 88 50 92 C63 88 73 70 75 47 C77 30 69 14 50 14 Z"></path><path d="M30 22 L25 8 L38 18 M70 22 L75 8 L62 18"></path><circle cx="39" cy="38" r="9"></circle><circle cx="61" cy="38" r="9"></circle><circle cx="39" cy="38" r="3" fill="currentColor"></circle><circle cx="61" cy="38" r="3" fill="currentColor"></circle><path d="M47 48 L50 56 L53 48"></path><path d="M33 58 Q42 72 46 86 M67 58 Q58 72 54 86 M41 64 L44 70 M59 64 L56 70"></path><path d="M36 96 H64 M44 92 V97 M50 92 V97 M56 92 V97"></path>';
        else if (i == 1) return '<path d="M16 12 H84 V18 H16 Z"></path><path d="M24 18 C12 18 12 34 24 34 C32 34 32 25 25 25"></path><path d="M76 18 C88 18 88 34 76 34 C68 34 68 25 75 25"></path><path d="M24 18 H76 M28 34 H72"></path><path d="M32 36 H68 V80 H32 Z"></path><path d="M40 38 V78 M50 38 V78 M60 38 V78"></path><path d="M28 80 H72 V86 H28 Z M22 86 H78 V93 H22 Z"></path>';
        else if (i == 2) return '<path d="M41 8 H59 V15 C59 21 55 23 55 28 C73 34 79 50 73 66 C68 78 59 86 50 90 C41 86 32 78 27 66 C21 50 27 34 45 28 C45 23 41 21 41 15 Z"></path><path d="M45 18 C32 16 27 26 34 36 M55 18 C68 16 73 26 66 36"></path><path d="M28 50 H72 M27 58 H73"></path><path d="M32 54 L36 51 L40 54 L44 51 L48 54 L52 51 L56 54 L60 51 L64 54 L68 51"></path><path d="M44 90 H56 V96 H44 Z"></path>';
        else if (i == 3) return '<path d="M50 10 V88 M36 92 H64 M42 88 H58"></path><circle cx="50" cy="12" r="3.5"></circle><path d="M14 24 H86"></path><path d="M20 24 L10 54 M20 24 L30 54 M80 24 L70 54 M80 24 L90 54"></path><path d="M8 54 H32 C30 64 26 68 20 68 C14 68 10 64 8 54 Z M68 54 H92 C90 64 86 68 80 68 C74 68 70 64 68 54 Z"></path>';
        else if (i == 4) return '<path d="M50 92 C24 88 12 64 18 38 C21 26 27 18 34 12"></path><path d="M50 92 C76 88 88 64 82 38 C79 26 73 18 66 12"></path><g fill="currentColor" stroke="none"><ellipse cx="22" cy="70" rx="7" ry="3.2" transform="rotate(-60 22 70)"></ellipse><ellipse cx="17" cy="54" rx="7" ry="3.2" transform="rotate(-85 17 54)"></ellipse><ellipse cx="19" cy="38" rx="7" ry="3.2" transform="rotate(-110 19 38)"></ellipse><ellipse cx="26" cy="24" rx="7" ry="3.2" transform="rotate(-130 26 24)"></ellipse><ellipse cx="33" cy="82" rx="7" ry="3.2" transform="rotate(-30 33 82)"></ellipse><ellipse cx="78" cy="70" rx="7" ry="3.2" transform="rotate(60 78 70)"></ellipse><ellipse cx="83" cy="54" rx="7" ry="3.2" transform="rotate(85 83 54)"></ellipse><ellipse cx="81" cy="38" rx="7" ry="3.2" transform="rotate(110 81 38)"></ellipse><ellipse cx="74" cy="24" rx="7" ry="3.2" transform="rotate(130 74 24)"></ellipse><ellipse cx="67" cy="82" rx="7" ry="3.2" transform="rotate(30 67 82)"></ellipse></g><path d="M44 92 C47 97 53 97 56 92 M50 92 L44 99 M50 92 L56 99"></path>';
        else if (i == 5) return '<path d="M30 10 H86 V92 H30 Z"></path><path d="M14 6 H24 L21 14 H17 Z M17 14 H21 V90 H17 Z"></path><path d="M14 92 H28"></path><g fill="currentColor" stroke="none"><rect x="36" y="18" width="9" height="4"></rect><rect x="49" y="18" width="9" height="4"></rect><rect x="62" y="18" width="9" height="4"></rect><rect x="75" y="18" width="7" height="4"></rect><rect x="36" y="29" width="9" height="4"></rect><rect x="62" y="29" width="9" height="4"></rect><rect x="75" y="29" width="7" height="4"></rect><rect x="36" y="40" width="9" height="4"></rect><rect x="49" y="40" width="9" height="4"></rect><rect x="75" y="40" width="7" height="4"></rect><rect x="49" y="51" width="9" height="4"></rect><rect x="62" y="51" width="9" height="4"></rect><rect x="36" y="62" width="9" height="4"></rect><rect x="49" y="62" width="9" height="4"></rect><rect x="62" y="62" width="9" height="4"></rect><rect x="75" y="62" width="7" height="4"></rect><rect x="36" y="73" width="9" height="4"></rect><rect x="62" y="73" width="9" height="4"></rect><rect x="75" y="73" width="7" height="4"></rect></g><rect x="47" y="49" width="13" height="8" fill="#e0703f" stroke="none"></rect>';
        revert("emblem");
    }

    function seal(uint8 i) internal pure returns (string memory) {
        if (i == 0) return '<circle cx="20" cy="20" r="18"></circle><circle cx="20" cy="20" r="11"></circle><path d="M20 9 V31 M9 20 H31"></path><circle cx="20" cy="20" r="2.5" fill="currentColor"></circle>';
        else if (i == 1) return '<rect x="3" y="3" width="34" height="34" rx="2"></rect><path d="M20 10 C15 10 11 14 11 19 C11 25 15 29 20 31 C25 29 29 25 29 19 C29 14 25 10 20 10 Z"></path><circle cx="20" cy="16" r="2.4"></circle><path d="M12 22 L6 28 M28 22 L34 28"></path>';
        else if (i == 2) return '<circle cx="20" cy="20" r="18"></circle><path d="M20 9 C14 9 12 14 13 19 C14 26 17 30 20 31 C23 30 26 26 27 19 C28 14 26 9 20 9 Z"></path><circle cx="17" cy="16" r="2"></circle><circle cx="23" cy="16" r="2"></circle><path d="M8 28 C6 22 6 16 9 11 M32 28 C34 22 34 16 31 11"></path>';
        else if (i == 3) return '<circle cx="20" cy="20" r="18"></circle><circle cx="20" cy="21" r="8"></circle><circle cx="17" cy="19" r="1.3" fill="currentColor"></circle><circle cx="23" cy="19" r="1.3" fill="currentColor"></circle><path d="M17 24 Q20 26 23 24"></path><path d="M20 13 Q18 8 20 5 M27 15 Q31 11 33 12 M13 15 Q9 11 7 12 M28 22 Q33 22 35 25 M12 22 Q7 22 5 25"></path>';
        else if (i == 4) return '<circle cx="20" cy="20" r="18"></circle><path d="M20 7 V33 M7 20 H33 M11 11 L29 29 M29 11 L11 29"></path><circle cx="20" cy="20" r="3.5" fill="currentColor"></circle>';
        revert("seal");
    }

    /// @dev `eng` is the engraving colour of the plate metal.
    function pattern(uint8 i, string memory eng) internal pure returns (string memory) {
        if (i == 0) return string.concat('<pattern id="pt" width="12" height="16" patternUnits="userSpaceOnUse"><circle cx="6" cy="4" r="2.6" fill="', eng, '"></circle><ellipse cx="6" cy="11.5" rx="1.8" ry="3.4" fill="', eng, '"></ellipse>', '</pattern>');
        else if (i == 1) return string.concat('<pattern id="pt" width="12" height="8" patternUnits="userSpaceOnUse"><rect x="2" y="1" width="8" height="5" fill="', eng, '"></rect>', '</pattern>');
        else if (i == 2) return string.concat('<pattern id="pt" width="12" height="16" patternUnits="userSpaceOnUse"><ellipse cx="6" cy="6" rx="3.6" ry="4.8" fill="none" stroke="', eng, '" stroke-width="1.5"></ellipse><path d="M6 12 V16 M4 14 L6 16 L8 14" fill="none" stroke="', eng, '" stroke-width="1.3"></path>', '</pattern>');
        else if (i == 3) return string.concat('<pattern id="pt" width="12" height="16" patternUnits="userSpaceOnUse"><path d="M6 16 C6 11 1 11 1 7 C1 3 6 2 8 5 C10 8 6 10 5 7" fill="none" stroke="', eng, '" stroke-width="1.6"></path>', '</pattern>');
        else if (i == 4) return string.concat('<pattern id="pt" width="12" height="16" patternUnits="userSpaceOnUse"><path d="M1 16 V1 H11 V12 H5 V6 H8" fill="none" stroke="', eng, '" stroke-width="1.6"></path>', '</pattern>');
        revert("pattern");
    }
}
// ===== SortesHouse.sol =====
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
    /// @dev The secret is public once fulfilled; emitting it lets anyone re-verify the result.
    event Fulfilled(uint256 indexed id, bytes32 secret, bytes32 result);
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
        emit Fulfilled(id, secret, result);
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
// ===== SortesRenderer.sol =====
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
// ===== SortesMint.sol =====
/// @title SortesMint ("Sortes Lots")
/// @notice An ERC-721 whose traits come from a Sortes fair result. Every mint opens one Sortes
/// request; `finalize` turns the result into traits once the request is final.
///
/// Two ways to mint, so every QoreChain wallet works today:
///  - `mint(commit)`: pay the house fee as `msg.value` (MetaMask on the EVM lane, inside an
///    EVM window opened from QoreX).
///  - `mintSponsored(commit)`: no value; the fee comes from a sponsor pool the owner tops up.
///    This is the QoreX path: a native-lane `MsgCrossVMCall` cannot carry value into the EVM.
contract SortesMint is ERC721, Ownable, ReentrancyGuard {
    ISortesHouse public immutable house;
    SortesRenderer public immutable renderer;
    uint256 public immutable MAX_SUPPLY;
    uint256 public immutable SPONSORED_PER_WALLET;

    struct Lot {
        uint256 requestId;
        bool finalized;
        bool isFloor;
        bool sponsored;
        /// @dev [metal, emblem, border, seal, frame]; the frame is the lot's tier.
        uint8[5] traits;
    }

    uint256 public totalMinted;
    uint256 public sponsorPool;
    mapping(uint256 => Lot) internal _lots;
    mapping(uint256 => uint256) public tokenOfRequest;
    mapping(address => uint256) public sponsoredMints;

    event Minted(uint256 indexed tokenId, address indexed to, uint256 indexed requestId, bool sponsored);
    event Revealed(uint256 indexed tokenId, uint8[5] traits, bool floor);
    event Sponsored(address indexed from, uint256 amount);
    event SponsorWithdrawn(address indexed to, uint256 amount);

    error SoldOut();
    error BadPrice();
    error PoolEmpty();
    error SponsorLimit();
    error NotFinal();
    error AlreadyFinalized();
    error UnknownToken();
    error TransferFailed();

    constructor(ISortesHouse house_, SortesRenderer renderer_, uint256 maxSupply, uint256 sponsoredPerWallet, address owner_)
        ERC721("Sortes Lots", "LOT")
        Ownable(owner_)
    {
        house = house_;
        renderer = renderer_;
        MAX_SUPPLY = maxSupply;
        SPONSORED_PER_WALLET = sponsoredPerWallet;
    }

    /// @notice Mint price: exactly the house fee.
    function price() public view returns (uint256) {
        return house.FEE();
    }

    /// @notice Paid mint. `commit` = house.commitmentOf(secret, msg.sender, address(this)).
    function mint(bytes32 commit) external payable nonReentrant returns (uint256 tokenId) {
        uint256 fee = price();
        if (msg.value != fee) revert BadPrice();
        tokenId = _mintLot(commit, fee, false);
    }

    /// @notice Sponsored mint for wallets that cannot send value into the EVM (QoreX today).
    function mintSponsored(bytes32 commit) external nonReentrant returns (uint256 tokenId) {
        uint256 fee = price();
        if (sponsorPool < fee) revert PoolEmpty();
        if (sponsoredMints[msg.sender] >= SPONSORED_PER_WALLET) revert SponsorLimit();
        sponsorPool -= fee;
        sponsoredMints[msg.sender]++;
        tokenId = _mintLot(commit, fee, true);
    }

    function _mintLot(bytes32 commit, uint256 fee, bool sponsored) internal returns (uint256 tokenId) {
        if (totalMinted >= MAX_SUPPLY) revert SoldOut();
        tokenId = ++totalMinted;
        uint256 requestId = house.request{value: fee}(commit, msg.sender);
        Lot storage lot = _lots[tokenId];
        lot.requestId = requestId;
        lot.sponsored = sponsored;
        tokenOfRequest[requestId] = tokenId;
        _safeMint(msg.sender, tokenId);
        emit Minted(tokenId, msg.sender, requestId, sponsored);
    }

    /// @notice Fix a lot's traits once its request is final. Anyone may call.
    /// Fulfilled: traits from the result. Either timeout: floor traits.
    function finalize(uint256 tokenId) external {
        Lot storage lot = _lots[tokenId];
        if (lot.requestId == 0) revert UnknownToken();
        if (lot.finalized) revert AlreadyFinalized();
        (ISortesHouse.Status status, bytes32 result) = house.resultOf(lot.requestId);

        uint8[5] memory t;
        bool isFloor;
        if (status == ISortesHouse.Status.Fulfilled) {
            t = Traits.derive(result);
        } else if (status == ISortesHouse.Status.HouseTimedOut || status == ISortesHouse.Status.UserTimedOut) {
            t = Traits.floor();
            isFloor = true;
        } else {
            revert NotFinal();
        }
        lot.finalized = true;
        lot.isFloor = isFloor;
        lot.traits = t;
        emit Revealed(tokenId, t, isFloor);
    }

    // ---------------------------------------------------------------- sponsor pool

    function sponsor() external payable {
        sponsorPool += msg.value;
        emit Sponsored(msg.sender, msg.value);
    }

    function withdrawSponsor(uint256 amount, address to) external onlyOwner nonReentrant {
        if (amount > sponsorPool) revert PoolEmpty();
        sponsorPool -= amount;
        emit SponsorWithdrawn(to, amount);
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @dev Refunds from a house timeout go to the minter, not here; plain transfers fund the pool.
    receive() external payable {
        sponsorPool += msg.value;
        emit Sponsored(msg.sender, msg.value);
    }

    // ---------------------------------------------------------------- views

    function lotOf(uint256 tokenId) external view returns (Lot memory) {
        if (_lots[tokenId].requestId == 0) revert UnknownToken();
        return _lots[tokenId];
    }

    /// @notice The traits a result would give, for verifiers.
    function traitsFor(bytes32 result) external pure returns (uint8[5] memory) {
        return Traits.derive(result);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Lot storage lot = _lots[tokenId];
        return renderer.tokenURI(tokenId, lot.requestId, lot.finalized, lot.isFloor, lot.traits);
    }
}
// ===== SortesDice.sol =====
/// @title SortesDice
/// @notice A second Sortes consumer, to show the house is reusable: pick 1 to 6, win 5.7x.
/// `msg.value` = stake + the house fee. A silent player forfeits; a silent house refunds the
/// stake (and the house pays the player its fee plus a penalty directly).
contract SortesDice is Ownable, ReentrancyGuard {
    ISortesHouse public immutable house;
    uint256 public immutable MAX_STAKE;
    uint256 public constant PAYOUT_X10 = 57; // 5.7x

    struct Bet {
        address player;
        uint8 pick;
        uint96 stake;
        bool settled;
    }

    mapping(uint256 => Bet) public bets; // by house request id
    uint256 public bankroll; // free funds that can back new bets
    uint256 public reserved; // max payouts of open bets
    mapping(address => uint256) public owed;

    event Rolled(uint256 indexed id, address indexed player, uint8 pick, uint256 stake);
    event Settled(uint256 indexed id, address indexed player, uint8 face, uint256 paid);

    error BadPick();
    error BadStake();
    error BankrollTooLow();
    error NotFinal();
    error AlreadySettled();

    constructor(ISortesHouse house_, uint256 maxStake, address owner_) Ownable(owner_) {
        house = house_;
        MAX_STAKE = maxStake;
    }

    function fund() external payable {
        bankroll += msg.value;
    }

    function defund(uint256 amount) external onlyOwner nonReentrant {
        if (amount > bankroll) revert BankrollTooLow();
        bankroll -= amount;
        _send(msg.sender, amount);
    }

    /// @param commit house.commitmentOf(secret, msg.sender, address(this))
    function roll(uint8 pick, bytes32 commit) external payable nonReentrant returns (uint256 id) {
        if (pick < 1 || pick > 6) revert BadPick();
        uint256 fee = house.FEE();
        if (msg.value <= fee || msg.value - fee > MAX_STAKE) revert BadStake();
        uint256 stake = msg.value - fee;
        uint256 win = (stake * PAYOUT_X10) / 10;
        // The stake itself backs part of the win; the bankroll covers the rest.
        if (bankroll < win - stake) revert BankrollTooLow();
        bankroll -= win - stake;
        reserved += win;
        id = house.request{value: fee}(commit, msg.sender);
        bets[id] = Bet(msg.sender, pick, uint96(stake), false);
        emit Rolled(id, msg.sender, pick, stake);
    }

    /// @notice Settle a final request. Anyone may call.
    function settle(uint256 id) external nonReentrant {
        Bet storage b = bets[id];
        if (b.player == address(0) || b.settled) revert AlreadySettled();
        (ISortesHouse.Status s, bytes32 result) = house.resultOf(id);
        uint256 win = (uint256(b.stake) * PAYOUT_X10) / 10;
        uint256 paid;
        uint8 face;
        if (s == ISortesHouse.Status.Fulfilled) {
            face = uint8(uint256(result) % 6 + 1);
            if (face == b.pick) paid = win;
        } else if (s == ISortesHouse.Status.HouseTimedOut) {
            paid = b.stake; // refund; the house already paid fee + penalty to the player
        } else if (s != ISortesHouse.Status.UserTimedOut) {
            revert NotFinal();
        }
        b.settled = true;
        reserved -= win;
        bankroll += win - paid;
        emit Settled(id, b.player, face, paid);
        _send(b.player, paid);
    }

    function claimOwed() external nonReentrant {
        uint256 a = owed[msg.sender];
        owed[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: a}("");
        require(ok, "transfer failed");
    }

    function _send(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount, gas: 50_000}("");
        if (!ok) owed[to] += amount;
    }
}
// ===== attacks/RandomnessProbe.sol =====
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

