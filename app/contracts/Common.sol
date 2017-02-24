pragma solidity ^0.4.8;

contract Owned {
  address owner;

  modifier onlyOwner {
    if (msg.sender != owner) {
      throw;
    }
    _;
  }

  function Owned() {
    owner = msg.sender;
  }

  function transferOwnership(address newOwner) onlyOwner {
    owner = newOwner;
  }

  function shutdown() onlyOwner {
    selfdestruct(owner);
  }

  function withdraw() onlyOwner {
    if (!owner.send(this.balance)) {
      throw;
    }
  }
}
