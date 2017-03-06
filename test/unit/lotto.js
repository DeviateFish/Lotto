var assert = require('assert');
var Embark = require('embark');
var sha3Utils = require('../../lib/sha3-utils');
var EmbarkSpec = Embark.initTests({
  embarkConfig: 'test/configs/lotto.json'
});
var web3 = EmbarkSpec.web3;

var NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
var INVALID_JUMP = /invalid JUMP/;
var OUT_OF_GAS = /out of gas/;

function assertInvalidJump(err) {
  assert.equal(INVALID_JUMP.test(err), true, 'Threw an invalid jump');
}

function Promisify(method) {
  return new Promise(function(resolve, reject) {
    method(function(err, result) {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

function getEvent(contract, event, blockNumber) {
  var filter = contract[event]({ from: blockNumber, to: blockNumber });
  return Promisify(filter.get.bind(filter));
}

function getReceipt(tx) {
  return Promisify(web3.eth.getTransactionReceipt.bind(web3.eth, tx));
}

function assertGoodReceipt(receipt) {
  assert.notEqual(receipt, undefined, 'Receipt exists');
  assert.ok(receipt.blockHash, 'Has a block hash');
  assert.ok(receipt.transactionHash, 'Has a transaction hash');
  assert.ok(receipt.blockNumber, 'Has a block number');
}

describe('Lotto', function() {
  var saltHash, saltNHash;
  var salt = web3.sha3('secret');
  var N = 12;
  saltHash = web3.sha3(salt, { encoding: 'hex' });
  for(var i = 1; i < N; i++) {
    saltHash = web3.sha3(saltHash, { encoding: 'hex' });
  }
  saltNHash = web3.sha3(sha3Utils.packHex(salt, sha3Utils.uintToHex(N, 8), salt), { encoding: 'hex' });
  var ticketPrice = web3.toWei(1, 'finney');

  var accounts;
  var curator;

  function getBalance(account) {
    return Promisify(web3.eth.getBalance.bind(web3.eth, account));
  }

  function gameLogic() {
    return Promisify(Lotto.gameLogic.bind(Lotto));
  }

  function currentRound() {
    return Promisify(Lotto.currentRound.bind(Lotto));
  }

  function setNewGameLogic(newAddress) {
    return Promisify(Lotto.setNewGameLogic.bind(Lotto, newAddress)).then(function(tx) {
      return getReceipt(tx);
    });
  }

  function finalizeRound() {
    return Promisify(Lotto.finalizeRound.bind(Lotto)).then(function(tx) {
      return getReceipt(tx);
    });
  }

  function previousRoundsCount() {
    return Promisify(Lotto.previousRoundsCount.bind(Lotto));
  }

  function setUpgradeAllowed(val) {
    return Promisify(DebugLotteryGameLogic.setUpgradeAllowed.bind(DebugLotteryGameLogic, val)).then(function(tx) {
      return getReceipt(tx);
    });
  }

  function setCurrentRound(val) {
    return Promisify(DebugLotteryGameLogic.setCurrentRound.bind(DebugLotteryGameLogic, val)).then(function(tx) {
      return getReceipt(tx);
    });
  }

  function deployLotto(logicAddress) {
    return new Promise(function(resolve, reject) {
      LottoContract.new(logicAddress, {
        from: accounts[0],
        gas: '1000000',
        data: '0x' + EmbarkSpec.contractsManager.contracts.Lotto.code
      }, function(err, result) {
        if (err) {
          reject(err);
        } else if (result.address) {
          resolve(result);
        }
      });
    });
  }

  function assignLogic() {
    return Promisify(DebugLotteryGameLogic.transferOwnership.bind(DebugLotteryGameLogic, Lotto.address)).then(function(tx) {
      return getReceipt(tx);
    });
  }

  before(function(done) {
    web3.eth.getAccounts(function(err, acc) {
      if (err) {
        return done(err);
      }
      accounts = acc;
      done();
    });
  });

  beforeEach(function(done) {
    curator = accounts[5];
    var contractsConfig = {
      DebugLotteryGameLogic: {
        gas: '1000000'
      },
      Owned: {
        gas: 'auto'
      }
    };

    new Promise(function(resolve, reject) {
      EmbarkSpec.deployAll(contractsConfig, resolve);
    }).then(function() {
      return deployLotto(DebugLotteryGameLogic.address);
    }).then(function(contract) {
      Lotto = contract;
      return assignLogic();
    }).then(function() {
      done();
    }).catch(function(err) {
      console.log(EmbarkSpec.logger);
      done(err);
    });
  });

  describe('deployment', function() {
    it('deploys successfully', function() {
      assert.notEqual(Lotto.address, 'undefined', 'Actually is deployed');
      return gameLogic().then(function(address) {
        assert.equal(address, DebugLotteryGameLogic.address, 'game logic is set');
      });
    });
  });

  describe('.setNewGameLogic', function() {
    it('can set a new game logic when allowed', function() {
      var newAddress = Owned.address;
      return setUpgradeAllowed(true).then(function(receipt) {
        assertGoodReceipt(receipt);
        return setNewGameLogic(newAddress);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return gameLogic();
      }).then(function(address) {
        assert.equal(address, newAddress, 'game logic is set');
      });
    });

    it('only the owner can set a new game logic contract', function() {
      var newAddress = Owned.address;
      return setUpgradeAllowed(true).then(function(receipt) {
        assertGoodReceipt(receipt);
        return Promisify(Lotto.setNewGameLogic.bind(Lotto, newAddress, { from: accounts[2] }));
      }).then(function(txhash) {
        assert.equal(txhash, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('cannot set a new game logic when a round is started', function() {
      var newAddress = Owned.address;
      return setUpgradeAllowed(false).then(function(receipt) {
        assertGoodReceipt(receipt);
        return setNewGameLogic(newAddress);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });
  });

  describe('.currentRound', function() {
    it('returns the current round if there is a current round', function() {
      var newAddress = Owned.address;
      return setCurrentRound(newAddress).then(function(receipt) {
        return currentRound();
      }).then(function(address) {
        assert.equal(address, newAddress, 'game logic is set');
      });
    });

    it('returns a null address when there is no current round', function() {
      var newAddress = NULL_ADDRESS;
      return setCurrentRound(newAddress).then(function(receipt) {
        return currentRound();
      }).then(function(address) {
        assert.equal(address, newAddress, 'game logic is set');
      });
    });
  });

  describe('.finalizeRound', function() {
    it('adds the round to the list of previous rounds', function() {
      var newAddress = Owned.address;
      return setCurrentRound(newAddress).then(function(receipt) {
        return finalizeRound();
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return previousRoundsCount();
      }).then(function(result) {
        assert.equal(result, 1, 'one previous round');
      });
    });

    it('only the owner can finalize rounds', function() {
      var newAddress = Owned.address;
      return setCurrentRound(newAddress).then(function(receipt) {
        return Promisify(Lotto.finalizeRound.bind(Lotto, { from: accounts[2] }));
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });
  });

  describe('.previousRoundsCount', function() {
    it('starts at 0', function() {
      return previousRoundsCount().then(function(result) {
        assert.equal(result, 0, 'no round history');
      });
    });

    it('increases when rounds are finalized', function() {
      var newAddress = Owned.address;
      return setCurrentRound(newAddress).then(function(receipt) {
        return finalizeRound();
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return previousRoundsCount();
      }).then(function(result) {
        assert.equal(result, 1, 'one previous round');
      });
    });
  });
});
