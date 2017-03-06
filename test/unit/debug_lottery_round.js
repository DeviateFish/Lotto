var assert = require('assert');
var Embark = require('embark');
var sha3Utils = require('../lib/sha3-utils');
var EmbarkSpec = Embark.initTests({
  embarkConfig: 'test/configs/debug_lottery_round.json'
});
var web3 = EmbarkSpec.web3;

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

function getReceipt(tx) {
  return Promisify(web3.eth.getTransactionReceipt.bind(web3.eth, tx));
}

function getEvent(contract, event, blockNumber) {
  var filter = contract[event]({ from: blockNumber, to: blockNumber });
  return Promisify(filter.get.bind(filter));
}

function assertGoodReceipt(receipt) {
  assert.notEqual(receipt, undefined, 'Receipt exists');
  assert.ok(receipt.blockHash, 'Has a block hash');
  assert.ok(receipt.transactionHash, 'Has a transaction hash');
  assert.ok(receipt.blockNumber, 'Has a block number');
}

describe('DebugLotteryRound', function() {
  var saltHash, saltNHash;
  var salt = web3.sha3('secret');
  var N = 12;
  saltHash = web3.sha3(salt, { encoding: 'hex' });
  for(var i = 1; i < N; i++) {
    saltHash = web3.sha3(saltHash, { encoding: 'hex' });
  }
  saltNHash = web3.sha3(sha3Utils.packHex(salt, sha3Utils.uintToHex(N, 8), salt), { encoding: 'hex' });

  var accounts;
  var ticketPrice = web3.toWei(1, 'finney');
  var validTicketMask = 0x7f7f7f7f;
  var payoutFraction = 950;


  function pickTicket(pick, from) {
    return Promisify(
      DebugLotteryRound.pickTicket.bind(
        DebugLotteryRound,
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

  function randomTicket(from) {
    return Promisify(
      DebugLotteryRound.randomTicket.bind(
        DebugLotteryRound,
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

  function getSaltHash() {
    return Promisify(DebugLotteryRound.saltHash.bind(DebugLotteryRound));
  }

  function getSaltNHash() {
    return Promisify(DebugLotteryRound.saltNHash.bind(DebugLotteryRound));
  }

  function getProofOfSalt(_salt, _N) {
    return Promisify(DebugLotteryRound.proofOfSalt.bind(DebugLotteryRound, _salt, _N));
  }

  function closeGame(_salt, _N) {
    return Promisify(DebugLotteryRound.closeGame.bind(DebugLotteryRound, _salt, _N)).then(function(receipt) {
      return getReceipt(receipt);
    });
  }

  function forceClose() {
    return Promisify(DebugLotteryRound.forceClose.bind(DebugLotteryRound)).then(function(receipt) {
      return getReceipt(receipt);
    });
  }

  function setWinningPick(pick) {
    return Promisify(DebugLotteryRound.setWinningNumbers.bind(DebugLotteryRound, salt, N, pick, { gas: '1000000' })).then(function(tx) {
      return getReceipt(tx);
    });
  }

  function getBalance(account) {
    return Promisify(web3.eth.getBalance.bind(web3.eth, account));
  }

  function validateCompletedEvent(_salt, _N, blockNumber) {
    return getEvent(DebugLotteryRound, 'LotteryRoundCompleted', blockNumber).then(function(results) {
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

  function validateDrawEvent(account, pick, blockNumber) {
    return getEvent(DebugLotteryRound, 'LotteryRoundDraw', blockNumber).then(function(results) {
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
        DebugLotteryRound: {
          args: [
            saltHash,
            saltNHash
          ],
          gas: '4000000'
        }
      };

      EmbarkSpec.deployAll(contractsConfig, done);
    });

    it('deploys successfully', function() {
      assert.notEqual(DebugLotteryRound.address, 'undefined', 'Actually is deployed');
      return getSaltHash().then(function(contractSaltHash) {
        assert.equal(contractSaltHash, saltHash, 'saltHash is publicly verifiable');
        return getSaltNHash();
      }).then(function(contractSaltNHash) {
        assert.equal(contractSaltNHash, saltNHash, 'saltNHash is publicly verifiable');
      });
    });

    it('has a verifiable salt and N', function() {
      return getProofOfSalt(salt, N).then(function(result) {
        assert.equal(result, true, 'Salt is verifiable');
      });
    });
  });

  describe('deployment with initial balance', function() {
    before(function(done) {
      var contractsConfig = {
        DebugLotteryRound: {
          args: [
            saltHash,
            saltNHash
          ],
          gas: '4000000',
          value: web3.toWei(10, 'ether')
        }
      };

      EmbarkSpec.deployAll(contractsConfig, done);
    });

    it('deploys successfully', function() {
      assert.notEqual(DebugLotteryRound.address, 'undefined', 'Actually is deployed');
      return getSaltHash().then(function(contractSaltHash) {
        assert.equal(contractSaltHash, saltHash, 'saltHash is publicly verifiable');
        return getSaltNHash();
      }).then(function(contractSaltNHash) {
        assert.equal(contractSaltNHash, saltNHash, 'saltNHash is publicly verifiable');
      });
    });

    it('has a verifiable salt and N', function() {
      return getProofOfSalt(salt, N).then(function(result) {
        assert.equal(result, true, 'Salt is verifiable');
      });
    });
  });

  describe('.closeGame', function() {
    before(function(done) {
      var contractsConfig = {
        DebugLotteryRound: {
          args: [
            saltHash,
            saltNHash
          ],
          gas: '4000000',
          value: web3.toWei(10, 'ether')
        }
      };

      return new Promise(function(resolve) {
        EmbarkSpec.deployAll(contractsConfig, function() {
          resolve();
        });
      }).then(function() {
        return forceClose();
      }).then(function() {
        done();
      });
    });

    it('does not pick numbers if the salt does not match', function() {
      var fakeSalt = web3.sha3('secret2');
      return closeGame(fakeSalt, N).then(function(receipt) {
        assert.equal(receipt, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('does not pick numbers if N does not match', function() {
      var fakeN = 10;
      return closeGame(salt, fakeN).then(function(receipt) {
        assert.equal(receipt, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('does not pick numbers if the sender is not the owner', function() {
      return Promisify(DebugLotteryRound.closeGame.bind(DebugLotteryRound, salt, N, { from: accounts[1] })).then(function(txhash) {
        assert.equal(txhash, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('picks numbers if salt and N match', function() {
      return closeGame(salt, N).then(function(receipt) {
        assertGoodReceipt(receipt);
        return validateCompletedEvent(salt, N, receipt.blockNumber);
      });
    });
  });

  // this one is pretty heavyweight, taking it out of the rotation until I figure out
  // a better way of doing it.
  describe.skip('.closeGame statistics', function() {
    beforeEach(function(done) {
      var contractsConfig = {
        DebugLotteryRound: {
          args: [
            saltHash,
            saltNHash
          ],
          gas: '4000000',
          value: web3.toWei(10, 'ether')
        }
      };

      return new Promise(function(resolve) {
        EmbarkSpec.deployAll(contractsConfig, function() {
          resolve();
        });
      }).then(function() {
        return Promisify(DebugLotteryRound.forceClose.bind(DebugLotteryRound));
      }).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(status) {
        done();
      });
    });

    // this doesn't actually work due to the "one winning draw per game" rule.
    // I could add some more hackiness into DebugLotteryRound to handle this, though...
    // It wouldn't give the greatest results, however, because there won't be good sources
    // of entropy.
    it('consistently produces valid results', function() {
      var rounds = 100;
      var picks = {};
      return Array.apply(null, Array(rounds)).reduce(function(p, _) {
        return p.then(function() {
          return closeGame(salt, N).then(function(receipt) {
            assertGoodReceipt(receipt);
            return validateCompletedEvent(salt, N, receipt.blockNumber);
          }).then(function(pick) {
            picks[pick] = (picks[pick] || 0) + 1;
          });
        });
      }, Promise.resolve()).then(function() {
        var values = Object.keys(picks).map(function(k) {
          return picks[k];
        });
        assert.equal(values.length > 97, true, 'Picks fewer than 2 duplicates');
        assert.equal(Math.max.apply(Math, values) < 3, true, 'Picks fewer than 3 of any given number');
      });
    });
  });

  describe('.finalizeRound', function() {
    var expectedTicketTotal = web3.toBigNumber(web3.toWei(5, 'finney'));
    var expectedPrizePool = expectedTicketTotal.times(payoutFraction).dividedBy(1000);
    var expectedOwnerFee = expectedTicketTotal.minus(expectedPrizePool);

    beforeEach(function(done) {
      var contractsConfig = {
        DebugLotteryRound: {
          args: [
            saltHash,
            saltNHash
          ],
          gas: '4000000',
          value: web3.toWei(10, 'ether')
        }
      };

      return new Promise(function(resolve) {
        EmbarkSpec.deployAll(contractsConfig, function() {
          resolve();
        });
      }).then(function() {
        return pickTicket('0x11223344', accounts[1]);
      }).then(function() {
        return pickTicket('0x11224433', accounts[2]);
      }).then(function() {
        return pickTicket('0x11224433', accounts[2]); // special case, 2x tickets, same account, same picks
      }).then(function() {
        return pickTicket('0x44332211', accounts[3]);
      }).then(function() {
        return pickTicket('0x44332211', accounts[4]);
      }).then(function() {
        return forceClose();
      }).then(function() {
        done();
      }).catch(function(err) {
        done(err);
      });
    });

    it('broadcasts a completion event', function() {
      var winningPick = '0x43322110';
      return setWinningPick(winningPick).then(function(receipt) {
        assertGoodReceipt(receipt);
        return validateCompletedEvent(salt, N, receipt.blockNumber);
      }).then(function(broadcastPicks) {
        assert.equal(broadcastPicks, winningPick, 'Broadcasts the winning picks');
      });
    });

    describe('no winners', function() {
      var winningPick = '0x21222324';
      var blockNumber;

      beforeEach(function(done) {
        setWinningPick(winningPick).then(function(receipt) {
          assertGoodReceipt(receipt);
          blockNumber = receipt.blockNumber;
          done();
        });
      });

      it('broadcasts no winner event when there is no winner', function() {
        return getEvent(DebugLotteryRound, 'LotteryRoundWinner', blockNumber).then(function(results) {
          assert.equal(results.length, 0, 'Broadcasts no events');
        });
      });

      it('leaves prizePool, prizeValue, and ownerFee as 0', function() {
        return Promisify(DebugLotteryRound.prizePool.bind(DebugLotteryRound)).then(function(result) {
          assert.equal(result.equals(0), true, 'Prize pool is 0');
          return Promisify(DebugLotteryRound.prizeValue.bind(DebugLotteryRound));
        }).then(function(result) {
          assert.equal(result.equals(0), true, 'Prize value is 0');
          return Promisify(DebugLotteryRound.ownerFee.bind(DebugLotteryRound));
        }).then(function(result) {
          assert.equal(result.equals(0), true, 'Owner fee is 0');
        });
      });
    });

    describe('multiple winners', function() {
      var winningPick = '0x44332211';
      var winners;
      var blockNumber;

      beforeEach(function(done) {
        winners = [accounts[3], accounts[4]];

        setWinningPick(winningPick).then(function(receipt) {
          assertGoodReceipt(receipt);
          blockNumber = receipt.blockNumber;
          done();
        });
      });

      it('broadcasts a winner event for each winner', function() {
        return getEvent(DebugLotteryRound, 'LotteryRoundWinner', blockNumber).then(function(results) {
          assert.equal(results.length, winners.length, 'Broadcasts one event per winner');
          results.forEach(function(result) {
            assert.notEqual(winners.indexOf(result.args.ticketHolder), -1, 'Broadcasts each winner');
            assert.equal(result.args.picks, winningPick, 'Broadcasts the winners\' picks');
          });
        });
      });

      it('sets prizePool, prizeValue, and ownerFee to the appropriate values', function() {
        return Promisify(DebugLotteryRound.prizePool.bind(DebugLotteryRound)).then(function(result) {
          assert.equal(result.equals(expectedPrizePool), true, 'Prize pool is correct');
          return Promisify(DebugLotteryRound.prizeValue.bind(DebugLotteryRound));
        }).then(function(result) {
          assert.equal(result.equals(expectedPrizePool.dividedBy(winners.length).floor()), true, 'Prize value is prize pool / winners');
          return Promisify(DebugLotteryRound.ownerFee.bind(DebugLotteryRound));
        }).then(function(result) {
          assert.equal(result.equals(expectedOwnerFee), true, 'Owner fee is correct');
        });
      });
    });

    describe('winner with duplicate tickets', function() {
      var winningPick = '0x11224433';
      var winner;
      var blockNumber;

      beforeEach(function(done) {
        winner = accounts[2];

        setWinningPick(winningPick).then(function(receipt) {
          assertGoodReceipt(receipt);
          blockNumber = receipt.blockNumber;
          done();
        });
      });

      it('broadcasts a single winner event when a single winner picked > 1 of the same ticket', function() {
        return getEvent(DebugLotteryRound, 'LotteryRoundWinner', blockNumber).then(function(results) {
          assert.equal(results.length, 1, 'Broadcasts one event');
          var result = results[0];
          assert.equal(winner, result.args.ticketHolder, 'Broadcasts each winner');
          assert.equal(result.args.picks, winningPick, 'Broadcasts the winners\' picks');
        });
      });

      it('sets prizePool, prizeValue, and ownerFee to the appropriate values', function() {
        return Promisify(DebugLotteryRound.prizePool.bind(DebugLotteryRound)).then(function(result) {
          assert.equal(result.equals(expectedPrizePool), true, 'Prize pool is correct');
          return Promisify(DebugLotteryRound.prizeValue.bind(DebugLotteryRound));
        }).then(function(result) {
          assert.equal(result.equals(expectedPrizePool), true, 'Prize value is prize pool');
          return Promisify(DebugLotteryRound.ownerFee.bind(DebugLotteryRound));
        }).then(function(result) {
          assert.equal(result.equals(expectedOwnerFee), true, 'Owner fee is correct');
        });
      });
    });
  });

  describe('.withdraw', function() {
    var expectedTicketTotal = web3.toBigNumber(web3.toWei(1, 'finney'));
    var expectedPrizePool = expectedTicketTotal.times(payoutFraction).dividedBy(1000);
    var expectedOwnerFee = expectedTicketTotal.minus(expectedPrizePool);

    beforeEach(function(done) {
      var contractsConfig = {
        DebugLotteryRound: {
          args: [
            saltHash,
            saltNHash
          ],
          gas: '4000000',
          value: web3.toWei(10, 'ether')
        }
      };

      return new Promise(function(resolve) {
        EmbarkSpec.deployAll(contractsConfig, function() {
          resolve();
        });
      }).then(function() {
        return pickTicket('0x11223344', accounts[1]);
      }).then(function() {
        return forceClose();
      }).then(function() {
        done();
      }).catch(function(err) {
        done(err);
      });
    });

    it('allows the whole pot to be reclaimed when there is no winner', function() {
      var winningPick = '0x21222324';
      return setWinningPick(winningPick).then(function(receipt) {
        assertGoodReceipt(receipt);
        return getBalance(accounts[0]);
      }).then(function(currentBalance) {
        var gasPaid;
        return Promisify(DebugLotteryRound.withdraw.bind(DebugLotteryRound)).then(function(tx) {
          return getReceipt(tx);
        }).then(function(receipt) {
          gasPaid = web3.toBigNumber(receipt.gasUsed);
          assertGoodReceipt(receipt);
          return Promisify(web3.eth.getTransaction.bind(web3.eth, receipt.transactionHash));
        }).then(function(transaction) {
          gasPaid = gasPaid.times(transaction.gasPrice);
          return getBalance(accounts[0]);
        }).then(function(newBalance) {
          assert.equal(newBalance.equals(currentBalance.minus(gasPaid).plus(expectedTicketTotal)), true, 'Reclaimed the ticket balance');
          return getBalance(DebugLotteryRound.address);
        }).then(function(contractBalance) {
          assert.equal(contractBalance.equals(0), true, 'contract has no remaining balance');
        });
      });
    });

    it('does not allow the pot to be reclaimed when there is a winner', function() {
      var winningPick = '0x11223344';
      return setWinningPick(winningPick).then(function(receipt) {
        assertGoodReceipt(receipt);
        return getBalance(accounts[0]);
      }).then(function(currentBalance) {
        var gasPaid;
        return Promisify(DebugLotteryRound.withdraw.bind(DebugLotteryRound)).then(function(tx) {
          return getReceipt(tx);
        }).then(function(receipt) {
          gasPaid = web3.toBigNumber(receipt.gasUsed);
          assertGoodReceipt(receipt);
          return Promisify(web3.eth.getTransaction.bind(web3.eth, receipt.transactionHash));
        }).then(function(transaction) {
          gasPaid = gasPaid.times(transaction.gasPrice);
          return getBalance(accounts[0]);
        }).then(function(newBalance) {
          assert.equal(newBalance.equals(currentBalance.minus(gasPaid)), true, 'Reclaimed no balance');
          return getBalance(DebugLotteryRound.address);
        }).then(function(contractBalance) {
          assert.equal(contractBalance.equals(expectedTicketTotal), true, 'contract retains the balance');
        });
      });
    });
  });

  describe('.shutdown', function() {
    var expectedTicketTotal = web3.toBigNumber(web3.toWei(1, 'finney'));
    var expectedPrizePool = expectedTicketTotal.times(payoutFraction).dividedBy(1000);
    var expectedOwnerFee = expectedTicketTotal.minus(expectedPrizePool);

    beforeEach(function(done) {
      var contractsConfig = {
        DebugLotteryRound: {
          args: [
            saltHash,
            saltNHash
          ],
          gas: '4000000',
          value: web3.toWei(10, 'ether')
        }
      };

      return new Promise(function(resolve) {
        EmbarkSpec.deployAll(contractsConfig, function() {
          resolve();
        });
      }).then(function() {
        return pickTicket('0x11223344', accounts[1]);
      }).then(function() {
        return forceClose();
      }).then(function() {
        done();
      }).catch(function(err) {
        done(err);
      });
    });

    it('allows the contract to be destroyed when there is no winner', function() {
      var winningPick = '0x21222324';
      return setWinningPick(winningPick).then(function(receipt) {
        assertGoodReceipt(receipt);
        return getBalance(accounts[0]);
      }).then(function(currentBalance) {
        var gasPaid;
        return Promisify(DebugLotteryRound.shutdown.bind(DebugLotteryRound)).then(function(tx) {
          return getReceipt(tx);
        }).then(function(receipt) {
          gasPaid = web3.toBigNumber(receipt.gasUsed);
          assertGoodReceipt(receipt);
          return Promisify(web3.eth.getTransaction.bind(web3.eth, receipt.transactionHash));
        }).then(function(transaction) {
          gasPaid = gasPaid.times(transaction.gasPrice);
          return getBalance(accounts[0]);
        }).then(function(newBalance) {
          assert.equal(newBalance.equals(currentBalance.minus(gasPaid).plus(expectedTicketTotal)), true, 'Reclaimed the ticket balance');
          return getBalance(DebugLotteryRound.address);
        }).then(function(contractBalance) {
          assert.equal(contractBalance.equals(0), true, 'contract has no remaining balance');
        });
      });
    });

    it('does not allow the contract to be destroyed when there is a winner', function() {
      var winningPick = '0x11223344';
      return setWinningPick(winningPick).then(function(receipt) {
        assertGoodReceipt(receipt);
        return getBalance(accounts[0]);
      }).then(function(currentBalance) {
        var gasPaid;
        return Promisify(DebugLotteryRound.shutdown.bind(DebugLotteryRound)).then(function(tx) {
          return getReceipt(tx);
        }).then(function(receipt) {
          gasPaid = web3.toBigNumber(receipt.gasUsed);
          assertGoodReceipt(receipt);
          return Promisify(web3.eth.getTransaction.bind(web3.eth, receipt.transactionHash));
        }).then(function(transaction) {
          gasPaid = gasPaid.times(transaction.gasPrice);
          return getBalance(accounts[0]);
        }).then(function(newBalance) {
          assert.equal(newBalance.equals(currentBalance.minus(gasPaid)), true, 'Reclaimed no balance');
          return getBalance(DebugLotteryRound.address);
        }).then(function(contractBalance) {
          assert.equal(contractBalance.equals(expectedTicketTotal), true, 'contract retains the balance');
        });
      });
    });
  });

  describe('.distributeWinnings', function() {
    var expectedTicketTotal = web3.toBigNumber(web3.toWei(5, 'finney'));
    var expectedPrizePool = expectedTicketTotal.times(payoutFraction).dividedBy(1000);
    var expectedOwnerFee = expectedTicketTotal.minus(expectedPrizePool);

    beforeEach(function(done) {
      var contractsConfig = {
        DebugLotteryRound: {
          args: [
            saltHash,
            saltNHash
          ],
          gas: '4000000',
          value: web3.toWei(10, 'ether')
        }
      };

      return new Promise(function(resolve) {
        EmbarkSpec.deployAll(contractsConfig, function() {
          resolve();
        });
      }).then(function() {
        return pickTicket('0x11223344', accounts[1]);
      }).then(function() {
        return pickTicket('0x11224433', accounts[2]);
      }).then(function() {
        return pickTicket('0x11224433', accounts[2]); // special case, 2x tickets, same account, same picks
      }).then(function() {
        return pickTicket('0x44332211', accounts[3]);
      }).then(function() {
        return pickTicket('0x44332211', accounts[4]);
      }).then(function() {
        return forceClose();
      }).then(function() {
        done();
      }).catch(function(err) {
        done(err);
      });
    });

    it('awards the whole pool to a single winner', function() {
      var winningPick = '0x11223344';
      var winner = accounts[1];
      var expectedPrizeValue = expectedPrizePool;
      return setWinningPick(winningPick).then(function(receipt) {
        return getBalance(winner);
      }).then(function(currentBalance) {
        return Promisify(DebugLotteryRound.distributeWinnings.bind(DebugLotteryRound)).then(function(tx) {
          return getReceipt(tx);
        }).then(function(receipt) {
          // are we able to pay out?
          assertGoodReceipt(receipt);
          return getBalance(winner);
        }).then(function(newBalance) {
          assert.equal(currentBalance.plus(expectedPrizeValue).equals(newBalance), true, 'Winner was paid');
        });
      });
    });

    it('awards the whole pool to a winner who purchased two of the same picks', function() {
      var winningPick = '0x11224433';
      var winner = accounts[2];
      var expectedPrizeValue = expectedPrizePool;
      return setWinningPick(winningPick).then(function(receipt) {
        return getBalance(winner);
      }).then(function(currentBalance) {
        return Promisify(DebugLotteryRound.distributeWinnings.bind(DebugLotteryRound)).then(function(tx) {
          return getReceipt(tx);
        }).then(function(receipt) {
          assertGoodReceipt(receipt);
          return getBalance(winner);
        }).then(function(newBalance) {
          assert.equal(currentBalance.plus(expectedPrizeValue).equals(newBalance), true, 'Winner was paid');
        });
      });
    });

    it('splits the pot between two winners', function() {
      var winningPick = '0x44332211';
      var winners = [accounts[3], accounts[4]];
      var expectedPrizeValue = expectedPrizePool.dividedBy(2).floor();
      return setWinningPick(winningPick).then(function(receipt) {
        return Promise.all([
          getBalance(winners[0]),
          getBalance(winners[1])
        ]);
      }).then(function(currentBalances) {
        return Promisify(DebugLotteryRound.distributeWinnings.bind(DebugLotteryRound)).then(function(tx) {
          return getReceipt(tx);
        }).then(function(receipt) {
          // are we able to pay out?
          assertGoodReceipt(receipt);
          return Promise.all([
            getBalance(winners[0]),
            getBalance(winners[1])
          ]);
        }).then(function(newBalances) {
          assert.equal(currentBalances[0].plus(expectedPrizeValue).equals(newBalances[0]), true, 'First winner was paid');
          assert.equal(currentBalances[1].plus(expectedPrizeValue).equals(newBalances[1]), true, 'Second winner was paid');
        });
      });
    });
  });

  describe('.claimOwnerFee', function() {
    var expectedTicketTotal = web3.toBigNumber(web3.toWei(1, 'finney'));
    var expectedPrizePool = expectedTicketTotal.times(payoutFraction).dividedBy(1000);
    var expectedOwnerFee = expectedTicketTotal.minus(expectedPrizePool);

    beforeEach(function(done) {
      var contractsConfig = {
        DebugLotteryRound: {
          args: [
            saltHash,
            saltNHash
          ],
          gas: '4000000',
          value: web3.toWei(10, 'ether')
        }
      };

      return new Promise(function(resolve) {
        EmbarkSpec.deployAll(contractsConfig, function() {
          resolve();
        });
      }).then(function() {
        return pickTicket('0x11223344', accounts[1]);
      }).then(function() {
        return forceClose();
      }).then(function() {
        done();
      }).catch(function(err) {
        done(err);
      });
    });

    it('does not allow the owner fee to be withdrawn when there is no winner', function() {
      var winningPick = '0x21222324';
      var output = accounts[5];
      return setWinningPick(winningPick).then(function(receipt) {
        assertGoodReceipt(receipt);
        return getBalance(output);
      }).then(function(currentBalance) {
        return Promisify(DebugLotteryRound.claimOwnerFee.bind(DebugLotteryRound, output)).then(function(tx) {
          return getReceipt(tx);
        }).then(function(receipt) {
          assertGoodReceipt(receipt);
          return getBalance(output);
        }).then(function(newBalance) {
          assert.equal(currentBalance.equals(newBalance), true, 'Output was not paid');
        });
      });
    });

    it('allows the owner fee to be withdrawn after a winner is chosen', function() {
      var winningPick = '0x11223344';
      var output = accounts[5];
      var expectedPrizeValue = expectedPrizePool;
      return setWinningPick(winningPick).then(function() {
        return getBalance(output);
      }).then(function(currentBalance) {
        return Promisify(DebugLotteryRound.claimOwnerFee.bind(DebugLotteryRound, output)).then(function(tx) {
          return getReceipt(tx);
        }).then(function(receipt) {
          assertGoodReceipt(receipt);
          return getBalance(output);
        }).then(function(newBalance) {
          assert.equal(currentBalance.plus(expectedOwnerFee).equals(newBalance), true, 'Output was paid');
        });
      });
    });

    it('does not allow the owner fee to be withdrawn multiple times', function() {
      var winningPick = '0x11223344';
      var output = accounts[5];
      var expectedPrizeValue = expectedPrizePool;
      return setWinningPick(winningPick).then(function() {
        return Promisify(DebugLotteryRound.claimOwnerFee.bind(DebugLotteryRound, output));
      }).then(function(tx) {
        return getReceipt(tx);
      }).then(function() {
        return getBalance(output);
      }).then(function(currentBalance) {
        return Promisify(DebugLotteryRound.claimOwnerFee.bind(DebugLotteryRound, output)).then(function(tx) {
          return getReceipt(tx);
        }).then(function(receipt) {
          assertGoodReceipt(receipt);
          return getBalance(output);
        }).then(function(newBalance) {
          assert.equal(currentBalance.equals(newBalance), true, 'Output was not paid a second time');
        });
      });
    });
  });

  // describe('.paidOut');

  // describe('.claimPrize');

  describe('.winningsClaimable', function() {
    // return Promise.all(winners.map(function(winner) {
    //       return Promisify(DebugLotteryRound.winningsClaimable.bind(DebugLotteryRound, winner));
    //     }));
    //   }).then(function(results) {
    //     results.forEach(function(result) {
    //       assert.equal(result, true, 'Winnings are claimable by the winner');
    //     });
    //     return Promisify(DebugLotteryRound.winningsClaimable.bind(DebugLotteryRound, accounts[2]));
    //   }).then(function(result) {
    //     assert.equal(result, false, 'Winnings are not claimable by a non-winner');

  });
});
