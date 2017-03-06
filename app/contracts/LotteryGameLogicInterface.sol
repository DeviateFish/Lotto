pragma solidity ^0.4.8;

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
