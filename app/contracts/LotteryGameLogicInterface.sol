pragma solidity ^0.4.8;

contract LotteryGameLogicInterface {
  address public currentRound;
  function relinquishFactory();
  function setFactory(address newFactory);
  function transferOwnership(address newOwner);
  function finalizeRound() returns(address);
}

contract LotteryGameLogicInterfaceV1 is LotteryGameLogicInterface {
  function setCurator(address newCurator);
}
