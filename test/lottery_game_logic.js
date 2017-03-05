var assert = require('assert');
var Embark = require('embark');
var sha3Utils = require('../lib/sha3-utils');

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

describe('LotteryGameLogic - 1', function() {
  var EmbarkSpec = Embark.initTests({
    embarkConfig: 'test/configs/lottery_game_logic.json'
  });
  var web3 = EmbarkSpec.web3;

  var saltHash, saltNHash;
  var salt = web3.sha3('secret');
  var N = 12;
  saltHash = web3.sha3(salt, { encoding: 'hex' });
  for(var i = 1; i < N; i++) {
    saltHash = web3.sha3(saltHash, { encoding: 'hex' });
  }
  saltNHash = web3.sha3(sha3Utils.packHex(salt, sha3Utils.uintToHex(N, 8), salt), { encoding: 'hex' });

  var accounts;

  function getReceipt(tx) {
    return Promisify(web3.eth.getTransactionReceipt.bind(web3.eth, tx));
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

  describe('deployment', function() {
    before(function(done) {
      var contractsConfig = {
        LotteryGameLogic: {
          gas: '1000000'
        },
        LotteryRoundFactory: {
          gas: '4000000'
        }
      };

      EmbarkSpec.deployAll(contractsConfig, done);
    });

    it('deploys successfully, with no initial configuration', function() {
      assert.notEqual(LotteryGameLogic.address, 'undefined', 'Actually is deployed');
      return Promisify(LotteryGameLogic.curator.bind(LotteryGameLogic)).then(function(address) {
        assert.equal(address, NULL_ADDRESS, 'curator is null');
        return Promisify(LotteryGameLogic.roundFactory.bind(LotteryGameLogic));
      }).then(function(address) {
        assert.equal(address, NULL_ADDRESS, 'roundFactory is null');
        return Promisify(LotteryGameLogic.currentRound.bind(LotteryGameLogic));
      }).then(function(address) {
        assert.equal(address, NULL_ADDRESS, 'currentRound is null');
      });
    });

    it('can have a round factory set', function() {
      return Promisify(LotteryGameLogic.setFactory.bind(LotteryGameLogic, LotteryRoundFactory.address)).then(function(tx) {
        return getReceipt(tx);
      }).then(function(receipt) {
        assert.ok(receipt.blockHash, 'was mined, etc');
        return Promisify(LotteryGameLogic.roundFactory.bind(LotteryGameLogic));
      }).then(function(address) {
        assert.equal(address, LotteryRoundFactory.address, 'roundFactory was set');
      });
    });

    it('can have a curator set', function() {
      var curator = accounts[5];
      return Promisify(LotteryGameLogic.setCurator.bind(LotteryGameLogic, curator)).then(function(tx) {
        return getReceipt(tx);
      }).then(function(receipt) {
        assert.ok(receipt.blockHash, 'was mined, etc');
        return Promisify(LotteryGameLogic.curator.bind(LotteryGameLogic));
      }).then(function(address) {
        assert.equal(address, curator, 'curator was set');
      });
    });
  });

  describe('starting a round', function() {
    var curator;
    beforeEach(function(done) {
      var contractsConfig = {
        LotteryGameLogic: {
          gas: '1000000'
        },
        LotteryRoundFactory: {
          gas: '4000000'
        }
      };

      curator = accounts[1];

      return new Promise(function(resolve) {
        EmbarkSpec.deployAll(contractsConfig, function() {
          resolve();
        });
      }).then(function() {
        return Promisify(LotteryGameLogic.setCurator.bind(LotteryGameLogic, curator));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryRoundFactory.transferOwnership.bind(LotteryRoundFactory, LotteryGameLogic.address));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.setFactory.bind(LotteryGameLogic, LotteryRoundFactory.address));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        done();
      }).catch(function(err) {
        done(err);
      });
    });

    it('does not allow anyone other than the curator to start round', function() {
      return Promisify(LotteryGameLogic.startRound.bind(LotteryGameLogic, saltHash, saltNHash)).then(function(tx) {
        return getReceipt(tx);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('lets the curator start the round', function() {
      return Promisify(LotteryGameLogic.startRound.bind(LotteryGameLogic, saltHash, saltNHash, { from: curator, gas: '2000000' })).then(function(tx) {
        return getReceipt(tx);
      }).then(function(receipt) {
        assert.ok(receipt.blockHash, 'was mined');
      });
    });

    it('sets the current round after starting', function() {
      return Promisify(LotteryGameLogic.startRound.bind(LotteryGameLogic, saltHash, saltNHash, { from: curator, gas: '2000000' })).then(function(tx) {
        return getReceipt(tx);
      }).then(function(receipt) {
        assert.ok(receipt.blockHash, 'was mined');
        return Promisify(LotteryGameLogic.currentRound.bind(LotteryGameLogic));
      }).then(function(roundAddress) {
        assert.notEqual(roundAddress, NULL_ADDRESS, 'Is not a null address');
        assert.notEqual(roundAddress, undefined, 'Is not undefined');
      });
    });

    it('lets the curator start the round with an initial balance', function() {
      var expectedBalance = web3.toWei(2, 'ether');
      return Promisify(LotteryGameLogic.deposit.bind(LotteryGameLogic, { value: expectedBalance })).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.startRound.bind(LotteryGameLogic, saltHash, saltNHash, { from: curator, gas: '2000000' }));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function(receipt) {
        assert.ok(receipt.blockHash, 'was mined');
        return Promisify(web3.eth.getBalance.bind(web3.eth, LotteryGameLogic.address));
      }).then(function(logicBalance) {
        assert.equal(logicBalance.equals(0), true, 'Game logic balance is emptied');
        return Promisify(LotteryGameLogic.currentRound.bind(LotteryGameLogic));
      }).then(function(roundAddress) {
        return Promisify(web3.eth.getBalance.bind(web3.eth, roundAddress));
      }).then(function(roundBalance) {
        assert.equal(roundBalance.equals(web3.toBigNumber(expectedBalance)), true, 'The new round balance equals the deposited amount');
      });
    });

    it('can relinquish control of the factory', function() {
      return Promisify(LotteryGameLogic.relinquishFactory.bind(LotteryGameLogic)).then(function(tx) {
        return getReceipt(tx);
      }).then(function(receipt) {
        assert.ok(receipt.blockHash, 'was mined');
        return Promisify(LotteryRoundFactory.createRound.bind(LotteryRoundFactory, saltHash, saltNHash, { gas: '2000000' }));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function(receipt) {
        assert.ok(receipt.blockHash, 'has control, could successfully create a new round');
      });
    });
  });

  describe('when round is in progress', function() {
    var curator;
    before(function(done) {
      var contractsConfig = {
        LotteryGameLogic: {
          gas: '1000000'
        },
        LotteryRoundFactory: {
          gas: '4000000'
        }
      };

      curator = accounts[1];

      return new Promise(function(resolve) {
        EmbarkSpec.deployAll(contractsConfig, function() {
          resolve();
        });
      }).then(function() {
        return Promisify(LotteryGameLogic.setCurator.bind(LotteryGameLogic, curator));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryRoundFactory.transferOwnership.bind(LotteryRoundFactory, LotteryGameLogic.address));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.setFactory.bind(LotteryGameLogic, LotteryRoundFactory.address));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.startRound.bind(LotteryGameLogic, saltHash, saltNHash, { from: curator, gas: '2000000' }));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        done();
      }).catch(function(err) {
        done(err);
      });
    });

    it('does not allow starting another round', function() {
      return Promisify(LotteryGameLogic.startRound.bind(LotteryGameLogic, saltHash, saltNHash, { from: curator, gas: '2000000' })).then(function(tx) {
        return getReceipt(tx);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('does not allow setting a new factory', function() {
      return Promisify(LotteryGameLogic.setFactory.bind(LotteryGameLogic, accounts[2])).then(function(tx) {
        return getReceipt(tx);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('does not allow setting a new curator', function() {
      return Promisify(LotteryGameLogic.setCurator.bind(LotteryGameLogic, accounts[2])).then(function(tx) {
        return getReceipt(tx);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('cannot relinquish control of the factory', function() {
      return Promisify(LotteryGameLogic.relinquishFactory.bind(LotteryGameLogic)).then(function(tx) {
        return getReceipt(tx);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('cannot close the game', function() {
      return Promisify(LotteryGameLogic.closeRound.bind(LotteryGameLogic, salt, N, { from: curator })).then(function(tx) {
        return getReceipt(tx);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('cannot finalize the round', function() {
      return Promisify(LotteryGameLogic.finalizeRound.bind(LotteryGameLogic)).then(function(tx) {
        return getReceipt(tx);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('does not allow depositing additional funds', function() {
      return Promisify(LotteryGameLogic.deposit.bind(LotteryGameLogic, { value: web3.toWei(3, 'ether') })).then(function(tx) {
        return getReceipt(tx);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('can return the current round', function() {
      return Promisify(LotteryGameLogic.currentRound.bind(LotteryGameLogic)).then(function(address) {
        assert.notEqual(address, undefined, 'Should return an address');
        assert.notEqual(address, NULL_ADDRESS, 'Should return an address');
      });
    });
  });
});

describe('LotteryGameLogic - 2', function() {
  var EmbarkSpec = Embark.initTests({
    embarkConfig: 'test/configs/lottery_game_logic_debug.json'
  });
  var web3 = EmbarkSpec.web3;

  var saltHash, saltNHash;
  var salt = web3.sha3('secret');
  var N = 12;
  saltHash = web3.sha3(salt, { encoding: 'hex' });
  for(var i = 1; i < N; i++) {
    saltHash = web3.sha3(saltHash, { encoding: 'hex' });
  }
  saltNHash = web3.sha3(sha3Utils.packHex(salt, sha3Utils.uintToHex(N, 8), salt), { encoding: 'hex' });

  var accounts;

  function getReceipt(tx) {
    return Promisify(web3.eth.getTransactionReceipt.bind(web3.eth, tx));
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

  describe('when the round is closed', function() {
    var curator;
    before(function(done) {
      var contractsConfig = {
        LotteryGameLogic: {
          gas: '1000000'
        },
        DebugLotteryRoundFactory: {
          gas: '4000000'
        }
      };

      curator = accounts[1];

      return new Promise(function(resolve) {
        EmbarkSpec.deployAll(contractsConfig, function() {
          resolve();
        });
      }).then(function() {
        return Promisify(LotteryGameLogic.setCurator.bind(LotteryGameLogic, curator));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(DebugLotteryRoundFactory.transferOwnership.bind(DebugLotteryRoundFactory, LotteryGameLogic.address));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.setFactory.bind(LotteryGameLogic, DebugLotteryRoundFactory.address));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.startRound.bind(LotteryGameLogic, saltHash, saltNHash, { from: curator, gas: '2000000' }));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.currentRound.bind(LotteryGameLogic));
      }).then(function(address) {
        var debugRound = DebugLotteryRoundContract.at(address);
        return Promisify(debugRound.forceClose.bind(debugRound));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.closeRound.bind(LotteryGameLogic, salt, N, { from: curator }));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        done();
      }).catch(function(err) {
        console.error(err);
        done(err);
      });
    });

    it('does not allow starting another round', function() {
      return Promisify(LotteryGameLogic.startRound.bind(LotteryGameLogic, saltHash, saltNHash, { from: curator, gas: '2000000' })).then(function(tx) {
        return getReceipt(tx);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('does not allow setting a new factory', function() {
      return Promisify(LotteryGameLogic.setFactory.bind(LotteryGameLogic, accounts[2])).then(function(tx) {
        return getReceipt(tx);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('does not allow setting a new curator', function() {
      return Promisify(LotteryGameLogic.setCurator.bind(LotteryGameLogic, accounts[2])).then(function(tx) {
        return getReceipt(tx);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('cannot relinquish control of the factory', function() {
      return Promisify(LotteryGameLogic.relinquishFactory.bind(LotteryGameLogic)).then(function(tx) {
        return getReceipt(tx);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('cannot close the game (again)', function() {
      return Promisify(LotteryGameLogic.closeRound.bind(LotteryGameLogic, salt, N, { from: curator })).then(function(tx) {
        return getReceipt(tx);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('does not allow depositing additional funds', function() {
      return Promisify(LotteryGameLogic.deposit.bind(LotteryGameLogic, { value: web3.toWei(3, 'ether') })).then(function(tx) {
        return getReceipt(tx);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('can return the current round', function() {
      return Promisify(LotteryGameLogic.currentRound.bind(LotteryGameLogic)).then(function(address) {
        assert.notEqual(address, undefined, 'Should return an address');
        assert.notEqual(address, NULL_ADDRESS, 'Should return an address');
      });
    });
  });

  describe('when the finalizing the round', function() {
    var curator;
    var expectedBalance = web3.toWei(2, 'ether');
    before(function(done) {
      var contractsConfig = {
        LotteryGameLogic: {
          gas: '1000000'
        },
        DebugLotteryRoundFactory: {
          gas: '4000000'
        }
      };

      curator = accounts[1];

      return new Promise(function(resolve) {
        EmbarkSpec.deployAll(contractsConfig, function() {
          resolve();
        });
      }).then(function() {
        return Promisify(LotteryGameLogic.setCurator.bind(LotteryGameLogic, curator));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(DebugLotteryRoundFactory.transferOwnership.bind(DebugLotteryRoundFactory, LotteryGameLogic.address));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.setFactory.bind(LotteryGameLogic, DebugLotteryRoundFactory.address));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.deposit.bind(LotteryGameLogic, { value: expectedBalance }));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function(){
        return Promisify(LotteryGameLogic.startRound.bind(LotteryGameLogic, saltHash, saltNHash, { from: curator, gas: '2000000' }));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.currentRound.bind(LotteryGameLogic));
      }).then(function(address) {
        var debugRound = DebugLotteryRoundContract.at(address);
        return Promisify(debugRound.forceClose.bind(debugRound));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.closeRound.bind(LotteryGameLogic, salt, N, { from: curator }));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.finalizeRound.bind(LotteryGameLogic));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function(tx) {
        done();
      }).catch(function(err) {
        done(err);
      });
    });

    it('ends the current round', function() {
      return Promisify(LotteryGameLogic.currentRound.bind(LotteryGameLogic)).then(function(address) {
        assert.equal(address, NULL_ADDRESS, 'Should return the null address');
      });
    });
  });

  describe('when the finalizing the round (with winners)', function() {
    function addPick(pick, account) {
      return Promisify(DebugLotteryRound.pickTicket.bind(
        DebugLotteryRound,
        pick,
        {
          value: web3.toWei(1, 'finney'),
          from: account,
          gas: '1000000'
        }
      )).then(function(tx) {
        return getReceipt(tx);
      });
    }

    function addPicks() {
      return addPick('0x11223344', accounts[1]).then(function() {
        return addPick('0x11224433', accounts[2]);
      }).then(function() {
        return addPick('0x11224433', accounts[2]); // special case, 2x tickets, same account, same picks
      }).then(function() {
        return addPick('0x44332211', accounts[3]);
      }).then(function() {
        return addPick('0x44332211', accounts[4]);
      });
    }

    var curator;
    before(function(done) {
      var contractsConfig = {
        LotteryGameLogic: {
          gas: '1000000'
        },
        DebugLotteryRoundFactory: {
          gas: '4000000'
        }
      };

      curator = accounts[1];

      return new Promise(function(resolve) {
        EmbarkSpec.deployAll(contractsConfig, function() {
          resolve();
        });
      }).then(function() {
        return Promisify(LotteryGameLogic.setCurator.bind(LotteryGameLogic, curator));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(DebugLotteryRoundFactory.transferOwnership.bind(DebugLotteryRoundFactory, LotteryGameLogic.address));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.setFactory.bind(LotteryGameLogic, DebugLotteryRoundFactory.address));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.startRound.bind(LotteryGameLogic, saltHash, saltNHash, { from: curator, gas: '2000000' }));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.currentRound.bind(LotteryGameLogic));
      }).then(function(address) {
        var debugRound = DebugLotteryRoundContract.at(address);

        return Promisify(debugRound.forceClose.bind(debugRound));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.closeRound.bind(LotteryGameLogic, salt, N, { from: curator }));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return Promisify(LotteryGameLogic.finalizeRound.bind(LotteryGameLogic));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function(tx) {
        done();
      }).catch(function(err) {
        done(err);
      });
    });

    it('ends the current round', function() {
      return Promisify(LotteryGameLogic.currentRound.bind(LotteryGameLogic)).then(function(address) {
        assert.equal(address, NULL_ADDRESS, 'Should return the null address');
      });
    });
  });
});
