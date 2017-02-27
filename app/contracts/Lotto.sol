pragma solidity ^0.4.8;

import "Common.sol";

contract Lotto is Owned {

  event LottoEvent(address indexed _owner, address indexed _param);
  address public foo;

  function Lotto() {}
}
