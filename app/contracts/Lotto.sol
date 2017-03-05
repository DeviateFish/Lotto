pragma solidity ^0.4.8;

import "Common.sol";
import "LotteryRoundFactoryInterface.sol";
import "LotteryGameLogicInterface.sol";

contract Lotto is Owned {

  address[] public previousRounds;

  LotteryRoundFactoryInterface public roundFactory;
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

  function linkFactory() internal {
    if (roundFactory != LotteryRoundFactoryInterface(0) && gameLogic != LotteryGameLogicInterface(0)) {
      roundFactory.transferOwnership(gameLogic);
      gameLogic.setFactory(roundFactory);
    }
  }

  function setNewFactory(address newFactory) onlyOwner onlyWhenUpgradeable {
    if (roundFactory != LotteryRoundFactoryInterface(0)) {
      roundFactory.transferOwnership(owner);
    }
    roundFactory = LotteryRoundFactoryInterface(newFactory);
    linkFactory();
  }

  function setNewGameLogic(address newLogic) onlyOwner onlyWhenUpgradeable {
    if (gameLogic != LotteryGameLogicInterface(0)) {
      // get any residual/carryover balance out.
      gameLogic.withdraw();
      // give up the factory
      gameLogic.relinquishFactory();
      // transfer ownership to the curator (owner);
      gameLogic.transferOwnership(owner);
    }
    gameLogic = LotteryGameLogicInterface(newLogic);
    if (this.balance > 0) {
      gameLogic.deposit.value(this.balance)();
    }
    linkFactory();
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
