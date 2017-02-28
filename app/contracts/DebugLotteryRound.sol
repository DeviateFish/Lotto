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
    finalizeRound(salt, N, _winningNumbers);
  }
}
