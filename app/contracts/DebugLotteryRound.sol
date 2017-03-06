pragma solidity ^0.4.8;

import "LotteryRound.sol";

/**
 * Wraps a LotteryRound to provide the ability to circumvent some logic for testing purposes.
 * Lets us do things like not wait until the closing block to pick numbers, etc.
 */
contract DebugLotteryRound is LotteryRound {
  function DebugLotteryRound(
    bytes32 _saltHash,
    bytes32 _saltNHash
  ) payable LotteryRound(_saltHash, _saltNHash) {

  }

  /**
   * Bypass the rules and close the game early.
   */
  function forceClose() {
    closingBlock = block.number;
  }

  /**
   * Bypass the PRNG and set the winning numbers directly.
   * @param salt              hidden entropy
   * @param N                 entropy key
   * @param _winningNumbers  pick these numbers as the winning numbers.
   */
  function setWinningNumbers(bytes32 salt, uint8 N, bytes4 _winningNumbers) beforeDraw {
    // Don't allow picking numbers multiple times.
    if (winningNumbersPicked == true) {
      throw;
    }

    if (proofOfSalt(salt, N) != true) {
      throw;
    }

    finalizeRound(salt, N, _winningNumbers);
  }
}
