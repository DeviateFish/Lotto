pragma solidity ^0.4.8;

contract LotteryGameLogicInterface {
  address public currentRound;
  function finalizeRound() returns(address);
  function isUpgradeAllowed() constant returns(bool);
  function transferOwnership(address newOwner);
  function deposit() payable;
  function withdraw();
}

contract LotteryGameLogicInterfaceV1 is LotteryGameLogicInterface {
  function relinquishFactory();
  function setFactory(address newFactory);
  function setCurator(address newCurator);
}
