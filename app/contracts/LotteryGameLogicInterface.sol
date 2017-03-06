pragma solidity ^0.4.8;

/**
 * The base interface is what the parent contract expects to be able to use.
 * If rules change in the future, and new logic is introduced, it only has to
 * implement these methods, wtih the role of the curator being used
 * to execute the additional functionality (if any).
 */
contract LotteryGameLogicInterface {
  address public currentRound;
  function finalizeRound() returns(address);
  function isUpgradeAllowed() constant returns(bool);
  function transferOwnership(address newOwner);
}

contract LotteryGameLogicInterfaceV1 is LotteryGameLogicInterface {
  function deposit() payable;
  function setCurator(address newCurator);
}
