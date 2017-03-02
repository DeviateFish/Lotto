pragma solidity ^0.4.8;

import "Common.sol";
import "LotteryRoundFactoryInterface.sol";
import "LotteryRoundInterface.sol";

contract LotteryGameLogic is Owned {

  LotteryRoundFactoryInterface public roundFactory;

  address public curator;

  LotteryRoundInterface public currentRound;

  modifier onlyCurator {
    if (msg.sender != curator) {
      throw;
    }
    _;
  }

  // used to give ownership of the factory back to the owner of this
  // contract, so it can be safely torn down, etc.
  // also used in preparation for upgrading the game logic contract.
  function relinquishFactory() onlyOwner {
    roundFactory.transferOwnership(owner);
  }

  function setFactory(address newFactory) onlyOwner {
    roundFactory = LotteryRoundFactoryInterface(newFactory);
  }

  function setCurator(address newCurator) onlyOwner {
    curator = newCurator;
  }

  function
}
