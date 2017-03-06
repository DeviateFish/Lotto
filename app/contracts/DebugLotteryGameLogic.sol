pragma solidity ^0.4.8;

import "Common.sol";
import "LotteryGameLogicInterface.sol";

// stripped down for debug purposes.
contract DebugLotteryGameLogic is LotteryGameLogicInterface, Owned {
  address public currentRound;

  function finalizeRound() returns(address) {
    address round = currentRound;

    delete currentRound;

    return round;
  }

  bool private _isUpgradeAllowed = true;

  function isUpgradeAllowed() constant returns(bool) {
    return _isUpgradeAllowed;
  }

  function setCurrentRound(address round) {
    currentRound = round;
  }

  function setUpgradeAllowed(bool allowed) {
    _isUpgradeAllowed = allowed;
  }
}
