pragma solidity ^0.4.8;

import "Common.sol";

contract Lotto is Owned {

  address[] public previousRounds;
  address public currentRound;

  address public roundFactory;
  address public gameLogic;

  function linkFactory() internal {
    roundFactory.transferOwnership(gameLogic);
    gameLogic.setFactory(roundFactory);
  }

  function setNewFactory(address newFactory) onlyOwner {
    roundFactory = newFactory;
    linkFactory();
  }

  function setNewGameLogic(address newLogic) onlyOwner {
    gameLogic.relinquishFactory();
    gameLogic = newLogic;
    linkFactory();
  }
}
