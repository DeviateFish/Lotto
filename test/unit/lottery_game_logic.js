var assert = require('assert');
var Embark = require('embark');
var sha3Utils = require('../../lib/sha3-utils');
var EmbarkSpec = Embark.initTests({
  embarkConfig: 'test/configs/lottery_game_logic_debug.json'
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

describe('LotteryGameLogic', function() {
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

  function getFactory() {
    return Promisify(LotteryGameLogic.roundFactory.bind(LotteryGameLogic));
  }

  function assignFactory() {
    return Promisify(DebugLotteryRoundFactory.transferOwnership.bind(DebugLotteryRoundFactory, LotteryGameLogic.address)).then(function(tx) {
      return getReceipt(tx);
    });
  }

  function setCurator(address) {
    return Promisify(LotteryGameLogic.setCurator.bind(LotteryGameLogic, address)).then(function(tx) {
      return getReceipt(tx);
    });
  }

  function getCurator() {
    return Promisify(LotteryGameLogic.curator.bind(LotteryGameLogic));
  }

  function startRound(_saltHash, _saltNHash) {
    return Promisify(LotteryGameLogic.startRound.bind(LotteryGameLogic, _saltHash, _saltNHash, { from: curator, gas: '2000000' })).then(function(tx) {
      return getReceipt(tx);
    });
  }

  function isUpgradeAllowed() {
    return Promisify(LotteryGameLogic.isUpgradeAllowed.bind(LotteryGameLogic));
  }

  function currentRound() {
    return Promisify(LotteryGameLogic.currentRound.bind(LotteryGameLogic));
  }

  function deposit(value) {
    return Promisify(LotteryGameLogic.deposit.bind(LotteryGameLogic, { value: value })).then(function(tx) {
      return getReceipt(tx);
    });
  }

  function closeRound(_salt, _N) {
    return Promisify(LotteryGameLogic.closeRound.bind(LotteryGameLogic, _salt, _N, { from: curator })).then(function(tx) {
      return getReceipt(tx);
    });
  }

  function forceCloseRound(roundAddress) {
    var round = DebugLotteryRoundContract.at(roundAddress);
    return Promisify(round.forceClose.bind(round)).then(function(tx) {
      return getReceipt(tx);
    });
  }

  function setWinningPick(roundAddress, pick) {
    var round = DebugLotteryRoundContract.at(roundAddress);
    return Promisify(round.setWinningNumbers.bind(round, salt, N, pick, { gas: '1000000' })).then(function(tx) {
      return getReceipt(tx);
    });
  }

  function pickTicket(roundAddress, pick, from) {
    var round = DebugLotteryRoundContract.at(roundAddress);
    return Promisify(
      round.pickTicket.bind(
        round,
        pick,
        {
          from: from,
          gas: '1000000',
          value: ticketPrice
        }
      )
    ).then(function(txhash) {
      return getReceipt(txhash);
    });
  }

  function finalizeRound() {
    return Promisify(LotteryGameLogic.finalizeRound.bind(LotteryGameLogic)).then(function(tx) {
      return getReceipt(tx);
    });
  }

  function deployFactory() {
    return new Promise(function(resolve, reject) {
      DebugLotteryRoundFactoryContract.new({
        from: accounts[0],
        gas: '4000000',
        data: '0x' + EmbarkSpec.contractsManager.contracts.DebugLotteryRoundFactory.code
      }, function(err, result) {
        if (err) {
          reject(err);
        } else if (result.address) {
          resolve(result);
        }
      });
    });
  }

  function deployLogic(factoryAddress, _curator) {
    return new Promise(function(resolve, reject) {
      LotteryGameLogicContract.new(factoryAddress, _curator, {
        from: accounts[0],
        gas: '1000000',
        data: '0x' + EmbarkSpec.contractsManager.contracts.LotteryGameLogic.code
      }, function(err, result) {
        if (err) {
          reject(err);
        } else if (result.address) {
          resolve(result);
        }
      });
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
    var contractsConfig = {};

    new Promise(function(resolve, reject) {
      EmbarkSpec.deployAll(contractsConfig, resolve);
    }).then(function() {
      return deployFactory();
    }).then(function(contract) {
      DebugLotteryRoundFactory = contract;
      return deployLogic(contract.address, curator);
    }).then(function(contract) {
      LotteryGameLogic = contract;
      return assignFactory();
    }).then(function() {
      done();
    }).catch(function(err) {
      done(err);
    });
  });

  describe('deployment', function() {
    it('deploys successfully, with the proper initial configuration', function() {
      assert.notEqual(LotteryGameLogic.address, 'undefined', 'Actually is deployed');
      return getCurator().then(function(address) {
        assert.equal(address, curator, 'curator is set');
        return getFactory();
      }).then(function(address) {
        assert.equal(address, DebugLotteryRoundFactory.address, 'roundFactory is set');
        return currentRound();
      }).then(function(address) {
        assert.equal(address, NULL_ADDRESS, 'currentRound is null');
      });
    });
  });

  describe('.setCurator', function() {
    it('can have a curator set', function() {
      return setCurator(curator).then(function(receipt) {
        assertGoodReceipt(receipt);
        return getCurator();
      }).then(function(address) {
        assert.equal(address, curator, 'curator was set');
      });
    });

    it('cannot have a curator set when a round is started', function() {
      return startRound(saltHash, saltNHash).then(function(receipt) {
        assertGoodReceipt(receipt);
        return setCurator(accounts[1]);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });
  });

  describe('.isUpgradeAllowed', function() {
    it('returns true when no round is in progress', function() {
      return isUpgradeAllowed().then(function(result) {
        assert.equal(result, true);
      });
    });

    it('returns true when there is no balance in the contract', function() {
      return isUpgradeAllowed().then(function(result) {
        assert.equal(result, true);
      });
    });

    it('returns true when there is a small balance in the contract', function() {
      return deposit(web3.toWei(100, 'szabo')).then(function() {
        return isUpgradeAllowed();
      }).then(function(result) {
        assert.equal(result, true);
      });
    });

    it('returns false when there is a large balance in the contract', function() {
      return deposit(web3.toWei(1, 'ether')).then(function() {
        return isUpgradeAllowed();
      }).then(function(result) {
        assert.equal(result, false);
      });
    });

    it('returns false when a round is in progress', function() {
      return startRound(saltHash, saltNHash).then(function(receipt) {
        assertGoodReceipt(receipt);
        return isUpgradeAllowed();
      }).then(function(result) {
        assert.equal(result, false);
      });
    });
  });

  describe('.startRound', function() {
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
      return startRound(saltHash, saltNHash).then(function(receipt) {
        assertGoodReceipt(receipt);
      });
    });

    it('sets the current round after starting', function() {
      return startRound(saltHash, saltNHash).then(function(receipt) {
        assertGoodReceipt(receipt);
        return currentRound();
      }).then(function(roundAddress) {
        assert.notEqual(roundAddress, NULL_ADDRESS, 'Is not a null address');
        assert.notEqual(roundAddress, undefined, 'Is not undefined');
      });
    });

    it('lets the curator start the round with an initial balance', function() {
      var expectedBalance = web3.toWei(2, 'ether');
      return deposit(expectedBalance).then(function(receipt) {
        assertGoodReceipt(receipt);
        return startRound(saltHash, saltNHash);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return getBalance(LotteryGameLogic.address);
      }).then(function(logicBalance) {
        assert.equal(logicBalance.equals(0), true, 'Game logic balance is emptied');
        return currentRound();
      }).then(function(roundAddress) {
        return getBalance(roundAddress);
      }).then(function(roundBalance) {
        assert.equal(roundBalance.equals(web3.toBigNumber(expectedBalance)), true, 'The new round balance equals the deposited amount');
      });
    });

    it('does not allow starting a round when one is already underway', function() {
      return startRound(saltHash, saltNHash).then(function(receipt) {
        assertGoodReceipt(receipt);
        return startRound(saltHash, saltNHash);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });
  });

  describe('.closeRound', function() {
    it('cannot close the round before the round is done', function() {
      return startRound(saltHash, saltNHash).then(function(receipt) {
        assertGoodReceipt(receipt);
        return closeRound(salt, N);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('only the curator can close the round', function() {
      return startRound(saltHash, saltNHash).then(function(receipt) {
        assertGoodReceipt(receipt);
        return currentRound();
      }).then(function(roundAddress) {
        return forceCloseRound(roundAddress);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return Promisify(LotteryGameLogic.closeRound.bind(LotteryGameLogic, salt, N));
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('cannot close a round if none is in progress', function() {
      return closeRound(salt, N).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('can close the round when the round is complete', function() {
      return startRound(saltHash, saltNHash).then(function(receipt) {
        assertGoodReceipt(receipt);
        return currentRound();
      }).then(function(roundAddress) {
        return forceCloseRound(roundAddress);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return closeRound(salt, N);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
      });
    });
  });

  describe('.finalizeRound', function() {
    it('cannot finalize a round that is not closed', function() {
      return startRound(saltHash, saltNHash).then(function(receipt) {
        assertGoodReceipt(receipt);
        return finalizeRound();
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('cannot finalize if there is no round', function() {
      return finalizeRound().then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('only the owner can finalize the round', function() {
      return startRound(saltHash, saltNHash).then(function(receipt) {
        assertGoodReceipt(receipt);
        return currentRound();
      }).then(function(roundAddress) {
        return forceCloseRound(roundAddress);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return closeRound(salt, N);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return Promisify(LotteryGameLogic.finalizeRound.bind(LotteryGameLogic, { from: curator }));
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('clears the current round', function() {
      return startRound(saltHash, saltNHash).then(function(receipt) {
        assertGoodReceipt(receipt);
        return currentRound();
      }).then(function(roundAddress) {
        return forceCloseRound(roundAddress);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return closeRound(salt, N);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return finalizeRound();
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return currentRound();
      }).then(function(roundAddress) {
        assert.equal(roundAddress, NULL_ADDRESS, 'currentRound was cleared');
      });
    });

    it('reclaims the balance if there are no winners', function() {
      var expectedBalance = web3.toWei(2, 'ether');
      return deposit(expectedBalance).then(function(receipt) {
        assertGoodReceipt(receipt);
        return startRound(saltHash, saltNHash);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return currentRound();
      }).then(function(roundAddress) {
        return forceCloseRound(roundAddress);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return closeRound(salt, N);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return finalizeRound();
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return getBalance(LotteryGameLogic.address);
      }).then(function(logicBalance) {
        assert.equal(logicBalance.equals(web3.toBigNumber(expectedBalance)), true, 'balance was returned');
      });
    });

    it('pays out winnings if there are winners', function() {
      var winningPick = '0x11223344';
      var winner = accounts[2];
      var payoutFraction = 950;
      var expectedTicketTotal = web3.toBigNumber(web3.toWei(1, 'finney'));
      var expectedPrizePool = expectedTicketTotal.times(payoutFraction).dividedBy(1000);
      var expectedOwnerFee = expectedTicketTotal.minus(expectedPrizePool);
      return startRound(saltHash, saltNHash).then(function(receipt) {
        assertGoodReceipt(receipt);
        return currentRound();
      }).then(function(roundAddress) {
        return pickTicket(roundAddress, winningPick, winner).then(function(receipt) {
          assertGoodReceipt(receipt);
          return forceCloseRound(roundAddress);
        }).then(function(receipt) {
          assertGoodReceipt(receipt);
          return setWinningPick(roundAddress, winningPick);
        });
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return Promise.all([
          getBalance(LotteryGameLogic.address),
          getBalance(winner),
          getBalance(curator)
        ]);
      }).then(function(balances) {
        return finalizeRound().then(function(receipt) {
          assertGoodReceipt(receipt);
          return Promise.all([
            getBalance(LotteryGameLogic.address),
            getBalance(winner),
            getBalance(curator)
          ]);
        }).then(function(endBalances) {
          assert.equal(endBalances[0].equals(0), true, 'no money returned to the game logic');
          assert.equal(endBalances[1].equals(balances[1].plus(expectedPrizePool)), true, 'winner was paid');
          assert.equal(endBalances[2].equals(balances[2].plus(expectedOwnerFee)), true, 'owner was paid');
        });
      });
    });
  });

  describe('.deposit', function() {
    it('only the owner can deposit funds', function() {
      return Promisify(LotteryGameLogic.deposit.bind(LotteryGameLogic, { value: web3.toWei(1, 'ether'), from: accounts[3] })).then(function(tx) {
        return getReceipt(tx);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('the owner can deposit funds', function() {
      var depositAmount = web3.toWei(1, 'ether');
      return deposit(depositAmount).then(function(receipt) {
        assertGoodReceipt(receipt);
        return getBalance(LotteryGameLogic.address);
      }).then(function(logicBalance) {
        assert.equal(logicBalance.equals(web3.toBigNumber(depositAmount)), true, 'funds are in the contract');
      });
    });

    it('the owner cannot deposit funds while a round is in progress', function() {
      var depositAmount = web3.toWei(1, 'ether');
      return assignFactory().then(function() {
        return setFactory(DebugLotteryRoundFactory.address);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return setCurator(curator);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return startRound(saltHash, saltNHash);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return deposit(depositAmount);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });
  });
});
