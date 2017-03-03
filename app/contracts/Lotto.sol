pragma solidity ^0.4.8;

import "Common.sol";
import "LotteryRoundFactoryInterface.sol";
import "LotteryGameLogicInterface.sol";

contract Lotto is Owned {

  address[] public previousRounds;

  LotteryRoundFactoryInterface public roundFactory;
  LotteryGameLogicInterface public gameLogic;

  function linkFactory() internal {
    if (roundFactory != LotteryRoundFactoryInterface(0) && gameLogic != LotteryGameLogicInterface(0)) {
      roundFactory.transferOwnership(gameLogic);
      gameLogic.setFactory(roundFactory);
    }
  }

  function setNewFactory(address newFactory) onlyOwner {
    if (roundFactory != LotteryRoundFactoryInterface(0)) {
      roundFactory.transferOwnership(owner);
    }
    roundFactory = LotteryRoundFactoryInterface(newFactory);
    linkFactory();
  }

  function setNewGameLogic(address newLogic) onlyOwner {
    if (gameLogic != LotteryGameLogicInterface(0)) {
      gameLogic.relinquishFactory();
      gameLogic.transferOwnership(owner);
    }
    gameLogic = LotteryGameLogicInterface(newLogic);
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
}
