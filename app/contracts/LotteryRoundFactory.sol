pragma solidity ^0.4.8;

import "Common.sol";
import "LotteryRound.sol";

contract LotteryRoundFactory is Owned {

  string public VERSION = '0.1.0';

  event LotteryRoundCreated(
    address newRound
  );

  function createRound(
    bytes32 _saltHash, 
    bytes32 _saltNHash
  ) onlyOwner returns(address) {
    LotteryRound newRound = new LotteryRound(
      _saltHash,
      _saltNHash
    );
  	if (newRound == LotteryRound(0)) {
      throw;
  	}
    newRound.transferOwnership(owner);
    LotteryRoundCreated(address(newRound));
    return address(newRound);
  }
}
