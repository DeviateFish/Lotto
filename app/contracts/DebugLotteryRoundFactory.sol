pragma solidity ^0.4.8;

import "Common.sol";
import "DebugLotteryRound.sol";
import "LotteryRoundFactoryInterface.sol";

contract DebugLotteryRoundFactory is LotteryRoundFactoryInterfaceV1, Owned {

  string public VERSION = '0.1.0';

  event LotteryRoundCreated(
    address newRound,
    string version
  );

  function createRound(
    bytes32 _saltHash,
    bytes32 _saltNHash
  ) payable onlyOwner returns(address) {
    DebugLotteryRound newRound;
    if (msg.value > 0) {
      newRound = (new DebugLotteryRound).value(msg.value)(
        _saltHash,
        _saltNHash
      );
    } else {
      newRound = new DebugLotteryRound(
        _saltHash,
        _saltNHash
      );
    }

    if (newRound == DebugLotteryRound(0)) {
      throw;
    }
    newRound.transferOwnership(owner);
    LotteryRoundCreated(address(newRound), VERSION);
    return address(newRound);
  }

  // Happy birthday to the ground!
  function () {
    throw;
  }
}
