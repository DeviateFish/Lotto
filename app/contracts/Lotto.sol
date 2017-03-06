pragma solidity ^0.4.8;

import "Common.sol";
import "LotteryRoundFactoryInterface.sol";
import "LotteryGameLogicInterface.sol";

contract Lotto is Owned {

  address[] public previousRounds;

  LotteryGameLogicInterface public gameLogic;

  modifier onlyWhenUpgradeable {
    if (gameLogic != LotteryGameLogicInterface(0) && !gameLogic.isUpgradeAllowed()) {
      throw;
    }
    _;
  }

  modifier onlyGameLogic {
    if (msg.sender != address(gameLogic)) {
      throw;
    }
    _;
  }

  // assumes that logic and factories are 1:1
  // note that this means an upgrade of the game logic that doesn't require
  // a factory upgrade will likely require a new factory contract anyway.
  // setting the game logic here presumes the incoming gamelogic contract
  // has already been configured.
  function setNewGameLogic(address newLogic) onlyOwner onlyWhenUpgradeable {
    relinquishGameLogic();
    gameLogic = LotteryGameLogicInterface(newLogic);
    if (this.balance > 0) {
      gameLogic.deposit.value(this.balance)();
    }
  }

  function relinquishGameLogic() onlyOwner onlyWhenUpgradeable {
    if (gameLogic != LotteryGameLogicInterface(0)) {
      // get any residual/carryover balance out.
      gameLogic.withdraw();
      // transfer ownership to the owner
      gameLogic.transferOwnership(owner);
    }
  }

  function currentRound() constant returns(address) {
    return gameLogic.currentRound();
  }

  function finalizeRound() onlyOwner {
    address roundAddress = gameLogic.finalizeRound();
    previousRounds.push(roundAddress);
  }

  function acquireRound(uint roundIndex) onlyOwner {
    if (roundIndex >= previousRounds.length) {
      throw;
    }
    Owned round = Owned(previousRounds[roundIndex]);
    round.transferOwnership(owner);
  }

  function previousRoundsCount() constant returns(uint) {
    return previousRounds.length;
  }

  // only the game logic contract should be sending this money,
  // and only when it's being upgraded and carrying a balance
  // from a previous round.
  function () payable onlyGameLogic {
    throw;
  }
}
