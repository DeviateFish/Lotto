pragma solidity ^0.4.8;

import "Common.sol";

contract LotteryRound is Owned {

  modifier beforeClose {
    if (block.number > closingBlock) {
      throw;
    }
    _;
  }

  modifier beforeDraw {
    if (block.number <= closingBlock || winningNumbersPicked) {
      throw;
    }
    _;
  }

  modifier afterDraw {
    if (winningNumbersPicked == false) {
      throw;
    }
    _;
  }

  event LotteryRoundStarted(
    bytes32 saltHash,
    bytes32 saltNHash,
    uint256 closingBlock,
    string version
  );
  event LotteryRoundDraw(
    address indexed ticketHolder,
    bytes4 indexed picks
  );
  event LotteryRoundCompleted(
    bytes32 salt,
    uint8 N,
    bytes4 indexed winningPicks
  );
  event LotteryRoundWinner(
    address indexed ticketHolder,
    bytes4 indexed picks
  );

  /*
    Public static variables
   */
  // public version string
  string public VERSION = '0.1.0';

  // round length
  uint256 public ROUND_LENGTH = 10000;

  // payout fraction (in thousandths):
  uint256 public PAYOUT_FRACTION = 990;

  // Cost per ticket
  uint public TICKET_PRICE = 1 finney;

  /*
    Public variables
   */
  // Pre-selected salt, hashed N times
  // serves as proof-of-salt
  bytes32 public saltHash;

  // single hash of salt.N.salt
  // serves as proof-of-N
  // 0 < N < 256
  bytes32 public saltNHash;

  // closing time.
  uint256 public closingBlock;

  // winning numbers
  bytes4 public winningNumbers;

  // This becomes true when the numbers have been picked
  bool public winningNumbersPicked = false;

  // This becomes populated if anyone wins
  address[] public winners;

  // Stores a flag to signal if the winner has winnings to be claimed
  mapping(address => bool) public winningsClaimable;

  /**
   * Current picks are from 0 to 127, or 2^7 - 1.
   * Current number of picks is 4
   * Rough odds of winning will be 1 in (2^7)^4, assuming even distributions, etc
   */
  mapping(bytes4 => address[]) public tickets;
  uint256 public nTickets = 0;

  // Set when winners are drawn, and represents the amount of the contract's current balance that can be paid out.
  uint256 public prizePool;

  // Set when winners are drawn, and signifies the amount each winner will receive.  In the event of multiple
  // winners, this will be prizePool / winners.length
  uint256 public prizeValue;

  // The fee at the time winners were picked (if there were winners).  This is the portion of the contract's balance
  // that goes to the contract owner.
  uint256 public ownerFee;

  // This will be the sha3 hash of the previous entropy + some additional inputs (e.g. randomly-generated hashes, etc)
  bytes32 private accumulatedEntropy;

  /**
   * Creates a new Lottery round, and sets the round's parameters.
   *
   * Note that this will implicitly set the factory to be the owner,
   * meaning the factory will need to be able to transfer ownership,
   * to its owner, the C&C contract.
   *
   * @param _saltHash       Hashed salt.  Will be hashed with sha3 N times
   * @param _saltNHash      Hashed proof of N, in the format sha3(salt+N+salt)
   */
  function LotteryRound(
    bytes32 _saltHash,
    bytes32 _saltNHash
  ) payable {
    saltHash = _saltHash;
    saltNHash = _saltNHash;
    closingBlock = block.number + ROUND_LENGTH;
    LotteryRoundStarted(
      saltHash,
      saltNHash,
      closingBlock,
      VERSION
    );
  }

  // Man! What do I look like? A charity case?
  // Please.
  // You can't buy me, hot dog man!
  function () {
    throw;
  }

  /**
   * Buy a ticket with pre-selected picks
   * @param picks User's picks.
   */
  function pickTicket(bytes4 picks) payable beforeClose {
    if (msg.value != TICKET_PRICE) {
      throw;
    }
    // don't allow invalid picks.
    for (uint8 i = 0; i < 4; i++) {
      if (picks[i] & 0x7f != picks[i]) {
        throw;
      }
    }
    tickets[picks].push(msg.sender);
    nTickets++;
    LotteryRoundDraw(msg.sender, picks);
  }

  function pickValues(bytes32 seed) internal returns (bytes4) {
    bytes4 picks;
    uint8 offset;
    for (uint8 i = 0; i < 4; i++) {
      offset = uint8(seed[0]) & 0x1f;
      seed = sha3(seed, msg.sender);
      picks = (picks >> 8) | bytes1(uint8(seed[offset]) & 0x7f);
    }
    return picks;
  }

  function randomTicket() payable beforeClose {
    if (msg.value != TICKET_PRICE) {
      throw;
    }
    uint8 pseudoRandomOffset = uint8(uint256(sha256(
      msg.sender,
      block.number,
      accumulatedEntropy
    )) & 0xff);
    // WARNING: This assumes block.number > 256... If block.number < 256, the below block.blockhash will return 0
    uint256 pseudoRandomBlock = block.number - pseudoRandomOffset - 1;
    bytes32 pseudoRand = sha3(
      block.number,
      block.blockhash(pseudoRandomBlock),
      msg.sender,
      accumulatedEntropy
    );
    bytes4 picks = pickValues(pseudoRand);
    tickets[picks].push(msg.sender);
    accumulatedEntropy = sha3(accumulatedEntropy, pseudoRand);
    LotteryRoundDraw(msg.sender, picks);
  }

  // TODO: Make internal
  function proofOfSalt(bytes32 salt, uint8 N) constant returns(bool) {
    // Proof-of-N:
    bytes32 _saltNHash = sha3(salt, N, salt);
    if (_saltNHash != saltNHash) {
      return false;
    }

    // Proof-of-salt:
    bytes32 _saltHash = sha3(salt);
    for (var i = 1; i < N; i++) {
      _saltHash = sha3(_saltHash);
    }
    if (_saltHash != saltHash) {
      return false;
    }
    return true;
  }

  function finalizeRound(bytes32 salt, uint8 N, bytes4 winningPicks) internal {
    winningNumbers = winningPicks;
    winningNumbersPicked = true;
    LotteryRoundCompleted(salt, N, winningNumbers);

    var _winners = tickets[winningNumbers];
    // if we have winners:
    if (_winners.length > 0) {
      // let's dedupe and broadcast the winners before figuring out the prize pool situation.
      for (uint i = 0; i < _winners.length; i++) {
        var winner = _winners[i];
        if (!winningsClaimable[winner]) {
          winners.push(winner);
          winningsClaimable[winner] = true;
          LotteryRoundWinner(winner, winningNumbers);
        }
      }
      // now let's wrap this up by finalizing the prize pool value:
      // There may be some rounding errors in here, but it should only amount to a couple wei.
      prizePool = this.balance * PAYOUT_FRACTION / 1000;
      prizeValue = prizePool / winners.length;

      // Note that the owner doesn't get to claim a fee until the game is won.
      ownerFee = this.balance - prizePool;
    }
    // we done.
  }

  function closeGame(bytes32 salt, uint8 N) onlyOwner beforeDraw {
    // Don't allow picking numbers multiple times.
    if (winningNumbersPicked == true) {
      throw;
    }

    if (proofOfSalt(salt, N) != true) {
      throw;
    }

    uint8 pseudoRandomOffset = uint8(uint256(sha256(
      salt,
      accumulatedEntropy
    )) & 0xff);
    // WARNING: This assumes block.number > 256... If block.number < 256, the below block.blockhash will return 0
    uint256 pseudoRandomBlock = block.number - pseudoRandomOffset - 1;
    bytes32 pseudoRand = sha3(
      salt,
      block.blockhash(pseudoRandomBlock),
      accumulatedEntropy
    );
    finalizeRound(salt, N, pickValues(pseudoRand));
  }

  // Send the owner's portion to an address of their discretion.
  // Also clears the owner fee, so the fee can only be withdrawn once.
  function claimOwnerFee(address payout) onlyOwner afterDraw {
    if (ownerFee > 0) {
      uint256 value = ownerFee;
      ownerFee = 0;
      if (!payout.send(value)) {
        throw;
      }
    }
  }

  // Override this so we can only withdraw the surplus, and after everyone's been paid.
  function withdraw() onlyOwner afterDraw {
    if (paidOut() && ownerFee == 0) {
      if (!owner.send(this.balance)) {
        throw;
      }
    }
  }

  // Override this one, too, so that we can only shut this thing down if there are either no winners,
  // or the winners have all been paid.  Once everything is paid out, there might be a few wei in here due to
  // rounding errors, etc, so we use this to clean that shit up. This performs the same function as `withdraw`, but
  // also shuts down the contract.
  function shutdown() onlyOwner afterDraw {
    if (paidOut() && ownerFee == 0) {
      selfdestruct(owner);
    }
  }

  function distributeWinnings() onlyOwner afterDraw {
    if (winners.length > 0) {
      for (uint i = 0; i < winners.length; i++) {
        address winner = winners[i];
        bool unclaimed = winningsClaimable[winner];
        if (unclaimed) {
          winningsClaimable[winner] = false;
          if (!winner.send(prizeValue)) {
            // If I can't send you money, dumbshit, you get to claim it on your own.
            // maybe next time don't use a contract or try to exploit the game.
            // Regardless, you're on your own.  Happy birthday to the ground.
            winningsClaimable[winner] = true;
          }
        }
      }
    }
  }

  /**
   * Returns true if it's after the draw, and either there are no winners, or all the winners have been paid.
   * @return {bool}
   */
  function paidOut() constant returns(bool) {
    // no need to use the modifier on this function, just do the same check
    // and return false instead.
    if (winningNumbersPicked == false) {
      return false;
    }
    if (winners.length > 0) {
      bool unclaimed = false;
      // if anyone hasn't been sent or claimed their earnings,
      // we still have money to pay out.
      for (uint i = 0; i < winners.length; i++) {
        address winner = winners[i];
        unclaimed = unclaimed || winningsClaimable[winner];
      }
      return unclaimed;
    } else {
      // no winners, nothing to pay.
      return true;
    }
  }

  function claimPrize() afterDraw {
    if (winningsClaimable[msg.sender]) {
      winningsClaimable[msg.sender] = false;
      if (!msg.sender.send(prizeValue)) {
        // you really are a dumbshit, aren't you.
        throw;
      }
    }
  }
}
