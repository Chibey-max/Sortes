// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISortesHouse} from "./interfaces/ISortesHouse.sol";
import {SortesRenderer} from "./SortesRenderer.sol";
import {Traits} from "./lib/Traits.sol";

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
        uint8[5] tier;
        uint8[5] variant;
    }

    uint256 public totalMinted;
    uint256 public sponsorPool;
    mapping(uint256 => Lot) internal _lots;
    mapping(uint256 => uint256) public tokenOfRequest;
    mapping(address => uint256) public sponsoredMints;

    event Minted(uint256 indexed tokenId, address indexed to, uint256 indexed requestId, bool sponsored);
    event Revealed(uint256 indexed tokenId, uint8[5] tier, uint8[5] variant, bool floor);
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

        Traits.Set memory s;
        bool isFloor;
        if (status == ISortesHouse.Status.Fulfilled) {
            s = Traits.derive(result);
        } else if (status == ISortesHouse.Status.HouseTimedOut || status == ISortesHouse.Status.UserTimedOut) {
            s = Traits.floor();
            isFloor = true;
        } else {
            revert NotFinal();
        }
        lot.finalized = true;
        lot.isFloor = isFloor;
        lot.tier = s.tier;
        lot.variant = s.variant;
        emit Revealed(tokenId, s.tier, s.variant, isFloor);
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
    function traitsFor(bytes32 result) external pure returns (uint8[5] memory tier, uint8[5] memory variant) {
        Traits.Set memory s = Traits.derive(result);
        return (s.tier, s.variant);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Lot storage lot = _lots[tokenId];
        Traits.Set memory s;
        s.tier = lot.tier;
        s.variant = lot.variant;
        return renderer.tokenURI(tokenId, lot.requestId, lot.finalized, lot.isFloor, s);
    }
}
