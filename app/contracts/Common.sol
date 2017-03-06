pragma solidity ^0.4.8;

/**
 * Very basic owned/mortal boilerplate.  Used for basically everything, for
 * security/access control purposes.
 */
contract Owned {
  address owner;

  modifier onlyOwner {
    if (msg.sender != owner) {
      throw;
    }
    _;
  }

  /**
   * Basic constructor.  The sender is the owner.
   */
  function Owned() {
    owner = msg.sender;
  }

  /**
   * Transfers ownership of the contract to a new owner.
   * @param newOwner  Who gets to inherit this thing.
   */
  function transferOwnership(address newOwner) onlyOwner {
    owner = newOwner;
  }

  /**
   * Shuts down the contract and removes it from the blockchain state.
   * Only available to the owner.
   */
  function shutdown() onlyOwner {
    selfdestruct(owner);
  }

  /**
   * Withdraw all the funds from this contract.
   * Only available to the owner.
   */
  function withdraw() onlyOwner {
    if (!owner.send(this.balance)) {
      throw;
    }
  }
}
