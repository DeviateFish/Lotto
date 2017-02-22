pragma solidity ^0.4.8;

import "Common.sol";

contract LotteryRound is Owned {

  event LotteryRoundDraw(
    address indexed _owner, 
    uint8 _1, 
    uint8 _2, 
    uint8 _3,
    uint8 _4,
    uint8 _5
  );

  bytes20 public salthash;
  bytes20 public saltroundshash;
  uint256 closingBlock;

  function LotteryRound(
    bytes20 _salthash, 
    bytes20 _saltroundshash,
    uint256 _closingBlock
  ) {
    salthash = _salthash;
    saltroundshash = _saltroundshash;
    closingBlock = _closingBlock;
  }

  
}
