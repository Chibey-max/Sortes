// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISortesHouse} from "./interfaces/ISortesHouse.sol";

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
