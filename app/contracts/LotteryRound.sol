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

  event LotteryRoundDraw(
    address indexed ticketHolder, 
    bytes5 indexed picks
  );
  event LotteryRoundCompleted(
    bytes32 salt,
    uint8 N,
    bytes5 indexed winningPick
  );
  event LotteryRoundWinner(
    address indexed ticketHolder
    bytes5 indexed picks
  );

  string public VERSION = '0.1.0';
  
  // Pre-selected salt, hashed N times
  // serves as proof-of-salt
  bytes32 public saltHash;

  // single hash of salt.N.salt
  // serves as proof-of-N
  // 0 < N < 256
  bytes32 public saltNHash;

  // closing time.
  uint256 public closingBlock;

  // percentage (thousandths) of the balance to be paid out.
  uint16 public payoutFraction;

  // Price per ticket.
  uint256 public ticketPrice;

  mapping(bytes5 => address[]) public tickets;
  uint256 public nTickets = 0;

  // index to keep track of randomly-drawn numbers.
  uint256 private randomIndex = 0;

  // winning numbers
  bytes5 public winningNumbers;

  // This becomes true when the numbers have been picked
  bool public winningNumbersPicked = false;

  // This becomes populated if anyone wins
  address[] public winners;

  // Stores a flag to signal if the winner has winnings to be claimed
  mapping(address => bool) public winningsClaimable;

  uint256 public prizePool;
  uint256 public prizeValue;

  /**
   * Creates a new Lottery round, and sets the round's parameters.
   *
   * Note that this will implicitly set the factory to be the owner,
   * meaning the factory will need to be able to transfer ownership,
   * to its owner, the C&C contract.
   * 
   * @param {bytes32} _saltHash       Hashed salt.  Will be hashed with sha3 N times
   * @param {bytes32} _saltNHash      Hashed proof of N, in the format sha3(salt+N+salt)
   * @param {uint256} _closingBlock   Block after which purchasing tickets is disallowed, and drawing winning numbers
   *                                  becomes enabled.
   * @param {uint16}  _payoutFraction How much of the earnings the winner wins.  This will probably be replaced by a
   *                                  tiered payout system, where N winning numbers nets some smaller fractions, and
   *                                  the total payout adds up to roughly the payout fraction.
   * @param {uint256} _ticketPrice    How much it costs to pick numbers.  It doesn't cost more to have the contract
   *                                  pick random numbers for you, since you pay the gas.
   */
  function LotteryRound(
    bytes32 _saltHash, 
    bytes32 _saltNHash,
    uint256 _closingBlock,
    uint16 _payoutFraction,
    uint256 _ticketPrice
  ) {
    // payoutFraction is a ratio out of 1000,
    // so it can't be greater than 1000
    if (_payoutFraction > 1000) {
      throw;
    }
    saltHash = _saltHash;
    saltNHash = _saltNHash;
    closingBlock = _closingBlock;
    payoutFraction = _payoutFraction;
    ticketPrice = _ticketPrice;
  }

  // Man! What do I look like? A charity case?
  // Please.
  // You can't buy me, hot dog man!
  function () {
    throw;
  }

  function pickTicket(bytes5 picks) payable beforeClose {
    if (msg.value != ticketPrice) {
      throw;
    }
    tickets[picks].push(msg.sender);
    nTickets++;
    LotteryRoundDraw(msg.sender, picks);
  }

  function pickValues(bytes32 seed) internal returns bytes5 {
    bytes5 picks;
    uint8 offset;
    for (var i = 0; i < 5; i++) {
      offset = seed[0] % 32;
      seed = sha3(seed, msg.sender);
      picks[i] = seed[offset] % 256;
    }
    return picks;
  }

  function randomTicket() payable beforeClose {
    if (msg.value != ticketPrice) {
      throw;
    }
    uint8 blockmax = 255;
    // this is just for sanity and/or ease of testing:
    if (block.number < 256) {
      blockmax = block.number - 1;
    }
    bytes32 pseudoRandomOffset = sha256(
      msg.sender, 
      block.number, 
      randomIndex++
    ) % blockmax;
    uint256 pseudoRandomBlock = block.number - pseudoRandomOffset - 1;
    bytes32 pseudoRand = sha3(
      block.number, 
      block.blockhash(pseudoRandomBlock), 
      msg.sender
    );
    bytes5 picks = pickValues(pseudoRand);
    tickets[picks].push(msg.sender);
    LotterRoundDraw(msg.sender, picks);
  }

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

  function closeGame(bytes32 salt, uint8 N) onlyOwner beforeDraw {
    // Don't allow picking numbers multiple times.
    if (winningNumbersPicked == true) {
      throw;
    }
    // Neither of these proofs is technically necessary, since these can be verified offline.  If gas costs for 
    // picking winning numbers (and/or paying winners) become prohibitive, these will probably be removed.
    if (proofOfSalt(salt, N) != true) {
      throw;
    }

    // this is just for sanity and/or ease of testing:
    if (block.number < 256) {
      blockmax = block.number - 1;
    }
    uint8 pseudoRandomOffset = sha256(
      salt,
      randomIndex,
      nTickets
    ) % blockmax;
    uint256 pseudoRandomBlock = block.number - pseudoRandomOffset - 1;
    if (saltNHash != saltRoundsHash)
    bytes32 pseudoRand = sha3(
      salt,
      block.blockhash(pseudoRandomBlock), 
      nTickets
    );
    winningNumbers = pickValues(pseudoRand);
    winningNumbersPicked = true;
    LotteryRoundCompleted(salt, N, winningNumbers);
    winners = tickets[winningNumbers];
    // if we have winners:
    if (winners.length > 0) {
      // now let's wrap this up by finalizing the prize pool value:
      prizePool = this.balance * payoutFraction / 1000;
      prizeValue = prizePool / winners.length;

      // and broadcast the winners:
      for (uint i = 0; i < winners.length; i++) {
        address winner = winners[i];
        winningsClaimable[winner] = true;
        LotteryRoundWinner(winners, winningNumbers);
      }
    }
    // we done.
  }

  // override this so we can only withdraw the surplus, and only after the drawing has completed:
  function withdraw() onlyOwner afterDraw {
    // TODO: bounds checking, maybe?
    // payoutFraction is, by definition, 1000 or less, and is set when the drawing is completed. the contract is 
    // only payable before the drawing, so balance should never decrease (outside the use of this function), which 
    // implies that this.balance should always be >= prizePool
    uint256 surplus = this.balance - prizePool;

    if (surplus > 0 && !owner.send(surplus)) {
      throw;
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
            // regardless, you're on your own.
            winningsClaimable[winner] = true;
          }
        }
      }
    }
  }

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
        unclaimed |= winningsClaimable[winner];
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
        // sucks to be you, bro.
        throw;
      }
    }
  }
}
