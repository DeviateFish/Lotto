pragma solidity ^0.4.8;

import "Common.sol";
import "LotteryRoundFactoryInterface.sol";
import "LotteryRoundInterface.sol";
import "LotteryGameLogicInterface.sol";

contract LotteryGameLogic is LotteryGameLogicInterfaceV1, Owned {

  modifier onlyWhenNoRound {
    if (currentRound != LotteryRoundInterface(0)) {
      throw;
    }
    _;
  }

  modifier onlyBeforeDraw {
    if (
      currentRound == LotteryRoundInterface(0) ||
      block.number <= currentRound.closingBlock() ||
      currentRound.winningNumbersPicked() == true
    ) {
      throw;
    }
    _;
  }

  modifier onlyAfterDraw {
    if (
      currentRound == LotteryRoundInterface(0) ||
      currentRound.winningNumbersPicked() == false
    ) {
      throw;
    }
    _;
  }

  modifier onlyCurator {
    if (msg.sender != curator) {
      throw;
    }
    _;
  }

  LotteryRoundFactoryInterfaceV1 public roundFactory;

  address public curator;

  LotteryRoundInterface public currentRound;

  // used to give ownership of the factory back to the owner of this
  // contract, so it can be safely torn down, etc.
  // also used in preparation for upgrading the game logic contract.
  function relinquishFactory() onlyOwner onlyWhenNoRound {
    roundFactory.transferOwnership(owner);
  }

  function setFactory(address newFactory) onlyOwner onlyWhenNoRound {
    roundFactory = LotteryRoundFactoryInterfaceV1(newFactory);
  }

  function setCurator(address newCurator) onlyOwner onlyWhenNoRound {
    curator = newCurator;
  }

  function isUpgradeAllowed() constant returns(bool) {
    return currentRound != LotteryRoundInterface(0);
  }

  function startRound(bytes32 saltHash, bytes32 saltNHash) onlyCurator onlyWhenNoRound {
    if (this.balance > 0) {
      currentRound = LotteryRoundInterface(
        roundFactory.createRound.value(this.balance)(saltHash, saltNHash)
      );
    } else {
      currentRound = LotteryRoundInterface(roundFactory.createRound(saltHash, saltNHash));
    }
  }

  function closeRound(bytes32 salt, uint8 N) onlyCurator onlyBeforeDraw {
    currentRound.closeGame(salt, N);
  }

  function finalizeRound() onlyOwner onlyAfterDraw returns(address) {
    address roundAddress = address(currentRound);
    if (!currentRound.paidOut()) {
      // we'll only make one attempt here to pay the winners
      currentRound.distributeWinnings();
      currentRound.claimOwnerFee(curator);
    } else {
      // otherwise, we have no winners, so just pull out funds in
      // preparation for the next round.
      currentRound.withdraw();
    }

    // clear this shit out.
    currentRound = LotteryRoundInterface(0);

    // if there are or were any problems distributing winnings, the winners can attempt to withdraw
    // funds for themselves.  The contracts won't be destroyed so long as they have funds to pay out.
    // handling them might require special care or something.

    return roundAddress;
  }

  function deposit() payable onlyOwner onlyWhenNoRound {
    // noop, just used for depositing funds during an upgrade.
  }

  // Man, this ain't my dad!
  // This is a cell phone!
  function () {
    throw;
  }
}
