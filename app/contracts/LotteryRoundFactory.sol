pragma solidity ^0.4.8;

import "Common.sol";

contract Template is Owned {

  event TemplateEvent(address indexed _owner, address indexed _param);
  address public foo;

  function Template() {}
}
