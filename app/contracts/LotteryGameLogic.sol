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

  modifier onlyFromCurrentRound {
    if (msg.sender != address(currentRound)) {
      throw;
    }
    _;
  }

  LotteryRoundFactoryInterfaceV1 public roundFactory;

  address public curator;

  LotteryRoundInterface public currentRound;

  function LotteryGameLogic(address _roundFactory, address _curator) {
    roundFactory = LotteryRoundFactoryInterfaceV1(_roundFactory);
    curator = _curator;
  }

  function setCurator(address newCurator) onlyOwner onlyWhenNoRound {
    curator = newCurator;
  }

  // allow for some dust to be remaining in the account
  // in case there have been rounding errors with payouts.
  // otherwise, upgrades shouldn't be allowed until the existing rules
  // have produced a winner, and only between rounds.
  function isUpgradeAllowed() constant returns(bool) {
    return currentRound == LotteryRoundInterface(0) && this.balance < 1 finney;
  }

  function startRound(bytes32 saltHash, bytes32 saltNHash)  onlyCurator onlyWhenNoRound {
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
    } else if (currentRound.balance > 0) {
      // otherwise, we have no winners, so just pull out funds in
      // preparation for the next round.
      currentRound.withdraw();
    }

    // clear this shit out.
    delete currentRound;

    // if there are or were any problems distributing winnings, the winners can attempt to withdraw
    // funds for themselves.  The contracts won't be destroyed so long as they have funds to pay out.
    // handling them might require special care or something.

    return roundAddress;
  }

  function deposit() payable onlyOwner onlyWhenNoRound {
    // noop, just used for depositing funds during an upgrade.
  }

  function () payable onlyFromCurrentRound {
    // another noop, since we can only receive funds from the current round.
  }
}
