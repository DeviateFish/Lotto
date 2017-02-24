pragma solidity ^0.4.8;

import "Common.sol";
import "LotteryRound.sol";

contract LotteryRoundFactory is Owned {

  event LotteryRoundCreated(
    address newRound
  );

  function createRound(
    bytes32 _saltHash, 
    bytes32 _saltNHash,
    uint256 _closingBlock,
    uint16 _payoutFraction,
    uint256 _ticketPrice
  ) onlyOwner returns(address) {
    LotteryRound newRound = new LotteryRound(
      _saltHash,
      _saltNHash,
      _closingBlock,
      _payoutFraction,
      _ticketPrice
    );
  	if (newRound == LotteryRound(0)) {
      throw;
  	}
    newRound.transferOwnership(owner);
    LotteryRoundCreated(address(newRound));
    return address(newRound);
  }
}
