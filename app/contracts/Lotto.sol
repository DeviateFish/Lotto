pragma solidity ^0.4.8;

import "Common.sol";
import "LotteryRoundFactoryInterface.sol";
import "LotteryGameLogicInterface.sol";

contract Lotto is Owned {

  address[] public previousRounds;

  LotteryGameLogicInterface public gameLogic;

  modifier onlyWhenUpgradeable {
    if (!gameLogic.isUpgradeAllowed()) {
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

  function Lotto(address initialGameLogic) {
    gameLogic = LotteryGameLogicInterface(initialGameLogic);
  }

  // assumes that logic and factories are 1:1
  // note that this means an upgrade of the game logic that doesn't require
  // a factory upgrade will likely require a new factory contract anyway.
  // setting the game logic here presumes the incoming gamelogic contract
  // has already been configured.
  function setNewGameLogic(address newLogic) onlyOwner onlyWhenUpgradeable {
    gameLogic.transferOwnership(owner);
    gameLogic = LotteryGameLogicInterface(newLogic);
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

  // You must think I'm a joke
  // I ain't gonna be part of your system
  // Man! Pump that garbage in another man's veins
  function () {
    throw;
  }
}
