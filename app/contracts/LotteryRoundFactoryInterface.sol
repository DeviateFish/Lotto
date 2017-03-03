pragma solidity ^0.4.8;

contract LotteryRoundFactoryInterface {
  string public VERSION;
  function transferOwnership(address newOwner);
}

contract LotteryRoundFactoryInterfaceV1 is LotteryRoundFactoryInterface {
  function createRound(bytes32 _saltHash, bytes32 _saltNHash) payable returns(address);
}
