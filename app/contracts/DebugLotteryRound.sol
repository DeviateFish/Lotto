pragma solidity ^0.4.8;

import "LotteryRound.sol";

contract DebugLotteryRound is LotteryRound {
  function DebugLotteryRound(
    bytes32 _saltHash,
    bytes32 _saltNHash
  ) payable LotteryRound(_saltHash, _saltNHash) {

  }

  function forceClose() onlyOwner {
    closingBlock = block.number;
  }

  function setWinningNumbers(bytes32 salt, uint8 N, bytes4 _winningNumbers) onlyOwner beforeDraw {
    // Don't allow picking numbers multiple times.
    if (winningNumbersPicked == true) {
      throw;
    }

    if (proofOfSalt(salt, N) != true) {
      throw;
    }

    // uint8 pseudoRandomOffset = uint8(uint256(sha256(
    //   salt,
    //   accumulatedEntropy
    // )) & 0xff);
    // // WARNING: This assumes block.number > 256
    // uint256 pseudoRandomBlock = block.number - pseudoRandomOffset - 1;
    // bytes32 pseudoRand = sha3(
    //   salt,
    //   block.blockhash(pseudoRandomBlock),
    //   accumulatedEntropy
    // );
    // winningNumbers = pickValues(pseudoRand);
    winningNumbers = _winningNumbers;
    winningNumbersPicked = true;
    LotteryRoundCompleted(salt, N, winningNumbers);

    winners = tickets[winningNumbers];
    // if we have winners:
    if (winners.length > 0) {
      // now let's wrap this up by finalizing the prize pool value:
      // There may be some rounding errors in here, but it should only amount to a couple wei.
      prizePool = this.balance * PAYOUT_FRACTION / 1000;
      prizeValue = prizePool / winners.length;
      ownerFee = this.balance - prizePool;

      // and broadcast the winners:
      for (uint i = 0; i < winners.length; i++) {
        address winner = winners[i];
        winningsClaimable[winner] = true;
        LotteryRoundWinner(winner, winningNumbers);
      }
    }
    // we done.
  }
}
