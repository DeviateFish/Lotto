var assert = require('assert');
var Embark = require('embark');
var sha3Utils = require('../lib/sha3-utils');
var EmbarkSpec = Embark.initTests({
  embarkConfig: 'test/configs/integration.json'
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

describe('Integration', function() {
  var Lotto, DebugLotteryRoundFactory, LotteryGameLogic;

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
  var roundLength = 12500;
  var version = '0.1.0';
  var validTicketMask = 0x7f7f7f7f;

  function getBalance(account) {
    return Promisify(web3.eth.getBalance.bind(web3.eth, account));
  }

  function gameLogic() {
    return Promisify(Lotto.gameLogic.bind(Lotto));
  }

  function currentRound() {
    return Promisify(Lotto.currentRound.bind(Lotto));
  }

  function finalizeRound(newAddress) {
    return Promisify(Lotto.finalizeRound.bind(Lotto)).then(function(tx) {
      return getReceipt(tx);
    });
  }

  function previousRoundsCount() {
    return Promisify(Lotto.previousRoundsCount.bind(Lotto));
  }

  function assignContract(contract, owner) {
    return Promisify(contract.transferOwnership.bind(contract, owner)).then(function(tx) {
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
    curator = accounts[1];
    var contractsConfig = {
      DebugLotteryRoundFactory: {
        gas: 'auto'
      },
      LotteryGameLogic: {
        gas: 'auto'
      },
      Lotto: {
        gas: 'auto'
      },
    };

    new Promise(function(resolve, reject) {
      EmbarkSpec.deployAll(contractsConfig, resolve);
    }).then(function() {
      done();
    }).catch(function(err) {
      console.log(EmbarkSpec.logger);
      done(err);
    });
  });

  describe('deployment', function() {
    it('dress rehearsal', function() {
      return deployFactory().then(function(factory) {
        return deployLogic(factory.address, curator).then(function(logic) {
          return assignContract(factory, logic.address).then(function(receipt) {
            assertGoodReceipt(receipt);
            return deployLotto(logic.address);
          }).then(function(lotto) {
            return assignContract(logic, lotto.address).then(function() {
              return lotto;
            });
          }).then(function(lotto) {
            assert.notEqual(lotto.address, NULL_ADDRESS, 'Lotto was successfully deployed');
          });
        });
      });
    });
  });

  describe('usage', function() {
    function startRound(_saltHash, _saltNHash) {
      return Promisify(LotteryGameLogic.startRound.bind(LotteryGameLogic, _saltHash, _saltNHash, { from: curator, gas: '2000000' })).then(function(tx) {
        return getReceipt(tx);
      });
    }

    function forceClose(roundAddress) {
      var round = DebugLotteryRoundContract.at(roundAddress);
      return Promisify(round.forceClose.bind(round)).then(function(receipt) {
        return getReceipt(receipt);
      });
    }

    function setWinningNumbers(roundAddress, pick) {
      var round = DebugLotteryRoundContract.at(roundAddress);
      return Promisify(round.setWinningNumbers.bind(round, salt, N, pick, { gas: '1000000' })).then(function(tx) {
        return getReceipt(tx);
      });
    }

    function finalizeRound() {
      return Promisify(Lotto.finalizeRound.bind(Lotto, { gas: '1000000' })).then(function(tx) {
        return getReceipt(tx);
      });
    }

    function previousRoundsCount() {
      return Promisify(Lotto.previousRoundsCount.bind(Lotto));
    }

    function previousRounds(index) {
      return Promisify(Lotto.previousRounds.bind(Lotto, index));
    }

    function validateCreatedEvent(blockNumber) {
      return getEvent(DebugLotteryRoundFactory, 'LotteryRoundCreated', blockNumber).then(function(results) {
        assert.equal(results.length, 1, 'One event emitted from DebugLotteryRoundFactory');
        var result = results[0];
        assert.equal(result.args.version, '0.1.0');
        return result.args.newRound;
      });
    }

    function validateStartedEvent(roundAddress, _saltHash, _saltNHash, _closingBlock, _version, blockNumber) {
      var contract = LotteryRoundContract.at(roundAddress);
      return getEvent(contract, 'LotteryRoundStarted', blockNumber).then(function(results) {
        assert.equal(results.length, 1, 'Only one event logged');
        var result = results[0];
        assert.equal(result.args.saltHash, _saltHash, 'Logs the proper saltHash');
        assert.equal(result.args.saltNHash, _saltNHash, 'Logs the proper saltNHash');
        assert.equal(result.args.closingBlock, _closingBlock, 'Logs the proper closingBlock');
        assert.equal(result.args.version, _version, 'Logs the proper version');
        return result.args.picks;
      });
    }

    function validateNewRound(roundAddress, _saltHash, _saltNHash) {
      var newRound = LotteryRoundContract.at(roundAddress);
      return Promisify(newRound.saltHash.bind(newRound)).then(function(contractSaltHash) {
        assert.equal(contractSaltHash, _saltHash, 'saltHash is publicly verifiable');
        return Promisify(newRound.saltNHash.bind(newRound));
      }).then(function(contractSaltNHash) {
        assert.equal(contractSaltNHash, _saltNHash, 'saltNHash is publicly verifiable');
      });
    }

    function validateDrawEvent(roundAddress, account, pick, blockNumber) {
      var newRound = LotteryRoundContract.at(roundAddress);
      return getEvent(newRound, 'LotteryRoundDraw', blockNumber).then(function(results) {
        assert.equal(results.length, 1, 'Only one event logged');
        var result = results[0];
        if (pick) {
          assert.equal(result.args.picks, pick, 'Logs the picked number');
        }
        assert.equal(
          web3.toDecimal(result.args.picks),
          web3.toDecimal(result.args.picks) & validTicketMask,
          'Pick satisfies valid picks requirement'
        );
        assert.equal(result.args.ticketHolder, account, 'Logs the proper ticketholder');
        return result.args.picks;
      });
    }

    function validateCompletedEvent(roundAddress, _salt, _N, blockNumber) {
      var newRound = LotteryRoundContract.at(roundAddress);
      return getEvent(newRound, 'LotteryRoundCompleted', blockNumber).then(function(results) {
        assert.equal(results.length, 1, 'Only one completed event logged');
        var result = results[0];
        assert.equal(
          web3.toDecimal(result.args.winningPicks),
          web3.toDecimal(result.args.winningPicks) & validTicketMask,
          'Picks satisfy valid picks requirement'
        );
        assert.equal(result.args.salt, salt, 'Reveals the chosen salt');
        assert.equal(result.args.N, N, 'Reveals the chosen N');
        return result.args.winningPicks;
      });
    }

    function validateWinnerEvents(roundAddress, winners, blockNumber) {
      var newRound = LotteryRoundContract.at(roundAddress);
      return getEvent(newRound, 'LotteryRoundWinner', blockNumber).then(function(results) {
        assert.equal(results.length, winners.length, 'One event per winner');
        results.forEach(function(result) {
          assert.notEqual(winners.indexOf(result.args.ticketHolder), -1, 'One event per winner');
        });
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

    function randomTicket(roundAddress, from) {
      var round = DebugLotteryRoundContract.at(roundAddress);
      return Promisify(
        round.randomTicket.bind(
          round,
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

    beforeEach(function(done) {
      deployFactory().then(function(factory) {
        DebugLotteryRoundFactory = factory;
        return deployLogic(factory.address, curator).then(function(logic) {
          LotteryGameLogic = logic;
          return assignContract(factory, logic.address).then(function(receipt) {
            assertGoodReceipt(receipt);
            return deployLotto(logic.address);
          }).then(function(lotto) {
            Lotto = lotto;
            return assignContract(logic, lotto.address);
          }).then(function() {
            done();
          });
        });
      });
    });

    it('end-to-end', function() {
      var blockNum;
      return startRound(saltHash, saltNHash).then(function(receipt) {
        assertGoodReceipt(receipt);
        blockNum = receipt.blockNumber;
        return validateCreatedEvent(receipt.blockNumber);
      }).then(function(newRoundAddress) {
        return validateNewRound(newRoundAddress, saltHash, saltNHash).then(function() {
          return validateStartedEvent(newRoundAddress, saltHash, saltNHash, blockNum + roundLength, version, blockNum);
        }).then(function(){
          return pickTicket(newRoundAddress, '0x11223344', accounts[2]);
        }).then(function(receipt) {
          assertGoodReceipt(receipt);
          return validateDrawEvent(newRoundAddress, accounts[2], '0x11223344', receipt.blockNumber);
        }).then(function() {
          return pickTicket(newRoundAddress, '0x00110011', accounts[3]);
        }).then(function(receipt) {
          assertGoodReceipt(receipt);
          return validateDrawEvent(newRoundAddress, accounts[3], '0x00110011', receipt.blockNumber);
        }).then(function() {
          return pickTicket(newRoundAddress, '0x55443322', accounts[4]);
        }).then(function(receipt) {
          assertGoodReceipt(receipt);
          return validateDrawEvent(newRoundAddress, accounts[4], '0x55443322', receipt.blockNumber);
        }).then(function() {
          return randomTicket(newRoundAddress, accounts[5]);
        }).then(function(receipt) {
          assertGoodReceipt(receipt);
          return validateDrawEvent(newRoundAddress, accounts[5], null, receipt.blockNumber);
        }).then(function() {
          return randomTicket(newRoundAddress, accounts[6]);
        }).then(function(receipt) {
          assertGoodReceipt(receipt);
          return validateDrawEvent(newRoundAddress, accounts[6], null, receipt.blockNumber);
        }).then(function() {
          // some bad pick or something.
          return pickTicket(newRoundAddress, '0x82919131', accounts[7]).catch(function(err) {
            assertInvalidJump(err);
          });
        }).then(function() {
          return forceClose(newRoundAddress);
        }).then(function(receipt) {
          assertGoodReceipt(receipt);
          return setWinningNumbers(newRoundAddress, '0x00110011');
        }).then(function(receipt) {
          assertGoodReceipt(receipt);
          return validateCompletedEvent(newRoundAddress, salt, N, receipt.blockNumber).then(function(picks) {
            assert.equal(picks, '0x00110011', 'has the winning picks');
            return validateWinnerEvents(newRoundAddress, [accounts[3]], receipt.blockNumber);
          });
        }).then(function() {
          return finalizeRound();
        }).then(function(receipt) {
          assertGoodReceipt(receipt);
          return previousRoundsCount();
        }).then(function(roundCount) {
          assert.equal(roundCount, 1, 'has a round in the previous rounds list');
          return previousRounds(0);
        }).then(function(previousAddress) {
          assert.equal(previousAddress, newRoundAddress, 'is indeed the old round');
          return currentRound();
        });
      }).then(function(round) {
        assert.equal(round, NULL_ADDRESS, 'current round is cleared');
        return startRound(saltHash, saltNHash);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        // we've come full-circle
      });
    });
  });
});
