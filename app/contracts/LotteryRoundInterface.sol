pragma solidity ^0.4.8;

contract LotteryRoundInterface {
  bool public winningNumbersPicked;

  function pickTicket(bytes4 picks) payable;
  function randomTicket() payable;

  function proofOfSalt(bytes32 salt, uint8 N) constant returns(bool);
  function closeGame(bytes32 salt, uint8 N);
  function claimOwnerFee(address payout);
  function withdraw();
  function shutdown();
  function distributeWinnings();
  function claimPrize();

  function paidOut() constant returns(bool);
}
