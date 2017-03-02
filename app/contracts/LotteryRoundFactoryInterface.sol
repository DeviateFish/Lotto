pragma solidity ^0.4.8;

contract LotteryRoundFactoryInterface {

  string public VERSION;

  function createRound(bytes32 _saltHash, bytes32 _saltNHash) returns(address);
}
