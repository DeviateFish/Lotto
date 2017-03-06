pragma solidity ^0.4.8;

import "Common.sol";
import "LotteryRound.sol";
import "LotteryRoundFactoryInterface.sol";

contract LotteryRoundFactory is LotteryRoundFactoryInterfaceV1, Owned {

  string public VERSION = '0.1.0';

  event LotteryRoundCreated(
    address newRound,
    string version
  );

  /**
   * Creates a new round, and sets the secret (hashed) salt and proof of N.
   * @param _saltHash     Hashed salt
   * @param _saltNHash    Hashed proof of N
   */
  function createRound(
    bytes32 _saltHash,
    bytes32 _saltNHash
  ) payable onlyOwner returns(address) {
    LotteryRound newRound;
    if (msg.value > 0) {
      newRound = (new LotteryRound).value(msg.value)(
        _saltHash,
        _saltNHash
      );
    } else {
      newRound = new LotteryRound(
        _saltHash,
        _saltNHash
      );
    }

    if (newRound == LotteryRound(0)) {
      throw;
    }
    newRound.transferOwnership(owner);
    LotteryRoundCreated(address(newRound), VERSION);
    return address(newRound);
  }

  // Man, this ain't my dad!
  // This is a cell phone!
  function () {
    throw;
  }
}
