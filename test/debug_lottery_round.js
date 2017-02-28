var assert = require('assert');
var Embark = require('embark');
var sha3Utils = require('../lib/sha3-utils');
var EmbarkSpec = Embark.initTests({
  embarkConfig: 'test/debug_lottery_round.json'
});
var web3 = EmbarkSpec.web3;

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
      return Promisify(DebugLotteryRound.saltHash.bind(DebugLotteryRound)).then(function(contractSaltHash) {
        assert.equal(contractSaltHash, saltHash, 'saltHash is publicly verifiable');
        return Promisify(DebugLotteryRound.saltNHash.bind(DebugLotteryRound));
      }).then(function(contractSaltNHash) {
        assert.equal(contractSaltNHash, saltNHash, 'saltNHash is publicly verifiable');
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
      return Promisify(DebugLotteryRound.saltHash.bind(DebugLotteryRound)).then(function(contractSaltHash) {
        assert.equal(contractSaltHash, saltHash, 'saltHash is publicly verifiable');
        return Promisify(DebugLotteryRound.saltNHash.bind(DebugLotteryRound));
      }).then(function(contractSaltNHash) {
        assert.equal(contractSaltNHash, saltNHash, 'saltNHash is publicly verifiable');
      });
    });
  });

  describe('picking winning numbers', function() {
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
        return Promisify(DebugLotteryRound.forceClose.bind(DebugLotteryRound));
      }).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(status) {
        done();
      });
    });

    it('does not pick numbers if the salt does not match', function() {
      var fakeSalt = web3.sha3('secret2');
      return Promisify(DebugLotteryRound.closeGame.bind(DebugLotteryRound, fakeSalt, N)).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assert.notEqual(err, undefined, 'Should thrown an error');
      });
    });

    it('does not pick numbers if N does not match', function() {
      var fakeN = 10;
      return Promisify(DebugLotteryRound.closeGame.bind(DebugLotteryRound, salt, fakeN)).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assert.notEqual(err, undefined, 'Should thrown an error');
      });
    });

    it('does not pick numbers if the sender is not the owner', function() {
      return Promisify(DebugLotteryRound.closeGame.bind(DebugLotteryRound, salt, N, { from: accounts[1] })).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assert.notEqual(err, undefined, 'Should thrown an error');
      });
    });

    it('picks numbers if salt and N match', function() {
      return Promisify(DebugLotteryRound.closeGame.bind(DebugLotteryRound, salt, N)).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.ok(success.transactionHash, 'Has a transaction hash');
        assert.ok(success.blockNumber, 'Has a block number');
        assert.ok(success.blockHash, 'Has a block hash');
        return getEvent(DebugLotteryRound, 'LotteryRoundCompleted', success.blockNumber).then(function(results) {
          assert.equal(results.length, 1, 'Only one completed event logged');
          var result = results[0];
          assert.equal(web3.toDecimal(result.args.winningPicks), web3.toDecimal(result.args.winningPicks) & 0x7f7f7f7f, 'Picks satisfy valid picks requirement');
          assert.equal(result.args.salt, salt, 'Reveals the chosen salt');
          assert.equal(result.args.N, N, 'Reveals the chosen N');
        });
      });
    });
  });

  describe('awarding winners', function() {
    function addPick(pick, account) {
      return Promisify(DebugLotteryRound.pickTicket.bind(DebugLotteryRound, pick, { value: web3.toWei(1, 'finney'), from: account })).then(function(tx) {
        return getReceipt(tx);
      });
    }

    function closeGame() {
      return Promisify(DebugLotteryRound.forceClose.bind(DebugLotteryRound)).then(function(receipt) {
        return getReceipt(receipt);
      });
    }

    function setWinningPick(pick) {
      return Promisify(DebugLotteryRound.setWinningNumbers.bind(DebugLotteryRound, salt, N, pick, { gas: '1000000' })).then(function(tx) {
        return getReceipt(tx);
      });
    }

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

      EmbarkSpec.deployAll(contractsConfig, done);
    });

    describe('winning scenarios', function() {
      // Note, this will change if the payout fraction changes.
      var expectedTicketTotal = web3.toBigNumber(web3.toWei(5, 'finney'));
      var expectedPrizePool = expectedTicketTotal.times(990).dividedBy(1000);
      var expectedOwnerFee = expectedTicketTotal.minus(expectedPrizePool);

      beforeEach(function(done) {
        addPick('0x11223344', accounts[1]).then(function() {
          return addPick('0x11224433', accounts[2]);
        }).then(function() {
          return addPick('0x11224433', accounts[2]); // special case, 2x tickets, same picks
        }).then(function() {
          return addPick('0x44332211', accounts[3]);
        }).then(function() {
          return addPick('0x44332211', accounts[4]);
        }).then(function() {
          return closeGame();
        }).then(function() {
          done();
        }).catch(function(err) {
          done(err);
        });
      });

      it('broadcasts a completion event', function() {
        var winningPick = '0x21222324';
        return setWinningPick(winningPick).then(function(success) {
          assert.ok(success.transactionHash, 'Has a transaction hash');
          assert.ok(success.blockNumber, 'Has a block number');
          assert.ok(success.blockHash, 'Has a block hash');
          return getEvent(DebugLotteryRound, 'LotteryRoundCompleted', success.blockNumber);
        }).then(function(results) {
          assert.equal(results.length, 1, 'Only one completed event logged');
          var result = results[0];
          assert.equal(result.args.winningPicks, winningPick, 'Broadcasts the winning picks');
          assert.equal(result.args.salt, salt, 'Reveals the chosen salt');
          assert.equal(result.args.N, N, 'Reveals the chosen N');
        });
      });

      it('allows the whole pot to be reclaimed when there is no winner', function() {
        var winningPick = '0x21222324';
        return setWinningPick(winningPick).then(function(success) {
          assert.ok(success.transactionHash, 'Has a transaction hash');
          assert.ok(success.blockNumber, 'Has a block number');
          assert.ok(success.blockHash, 'Has a block hash');
          return Promisify(web3.eth.getBalance.bind(web3.eth, accounts[0]));
        }).then(function(currentBalance) {
          var gasPaid;
          return Promisify(DebugLotteryRound.withdraw.bind(DebugLotteryRound)).then(function(tx) {
            return getReceipt(tx);
          }).then(function(success) {
            gasPaid = web3.toBigNumber(success.gasUsed);
            assert.ok(success.transactionHash, 'Has a transaction hash');
            assert.ok(success.blockNumber, 'Has a block number');
            assert.ok(success.blockHash, 'Has a block hash');
            return Promisify(web3.eth.getTransaction.bind(web3.eth, success.transactionHash));
          }).then(function(transaction) {
            gasPaid = gasPaid.times(transaction.gasPrice);
            return Promisify(web3.eth.getBalance.bind(web3.eth, accounts[0]));
          }).then(function(newBalance) {
            assert.equal(newBalance.equals(currentBalance.minus(gasPaid).plus(expectedTicketTotal)), true, 'Reclaimed the ticket balance');
          });
        });
      });

      it('allows the contract to be destroyed when there is no winner', function() {
        var winningPick = '0x21222324';
        return setWinningPick(winningPick).then(function(success) {
          assert.ok(success.transactionHash, 'Has a transaction hash');
          assert.ok(success.blockNumber, 'Has a block number');
          assert.ok(success.blockHash, 'Has a block hash');
          return Promisify(web3.eth.getBalance.bind(web3.eth, accounts[0]));
        }).then(function(currentBalance) {
          var gasPaid;
          return Promisify(DebugLotteryRound.shutdown.bind(DebugLotteryRound)).then(function(tx) {
            return getReceipt(tx);
          }).then(function(success) {
            gasPaid = web3.toBigNumber(success.gasUsed);
            assert.ok(success.transactionHash, 'Has a transaction hash');
            assert.ok(success.blockNumber, 'Has a block number');
            assert.ok(success.blockHash, 'Has a block hash');
            return Promisify(web3.eth.getTransaction.bind(web3.eth, success.transactionHash));
          }).then(function(transaction) {
            gasPaid = gasPaid.times(transaction.gasPrice);
            return Promisify(web3.eth.getBalance.bind(web3.eth, accounts[0]));
          }).then(function(newBalance) {
            assert.equal(newBalance.equals(currentBalance.minus(gasPaid).plus(expectedTicketTotal)), true, 'Reclaimed the ticket balance');
          });
        });
      });

      it('awards the whole pool to a single winner', function() {
        var winningPick = '0x11223344';
        var winner = accounts[1];
        var expectedPrizeValue = expectedPrizePool;
        return setWinningPick(winningPick).then(function(success) {
          return getEvent(DebugLotteryRound, 'LotteryRoundWinner', success.blockNumber);
        }).then(function(results) {
          assert.equal(results.length, 1, 'Only one winner event logged');
          var result = results[0];
          assert.equal(result.args.ticketHolder, winner, 'Broadcasts the winner');
          assert.equal(result.args.picks, winningPick, 'Broadcasts the winner\'s picks');
          return Promisify(DebugLotteryRound.winningsClaimable.bind(DebugLotteryRound, winner));
        }).then(function(result) {
          assert.equal(result, true, 'Winnings are claimable by the winner');
          return Promisify(DebugLotteryRound.winningsClaimable.bind(DebugLotteryRound, accounts[2]));
        }).then(function(result) {
          assert.equal(result, false, 'Winnings are not claimable by a non-winner');
          return Promisify(DebugLotteryRound.prizePool.bind(DebugLotteryRound));
        }).then(function(result) {
          assert.equal(result.equals(expectedPrizePool), true, 'Prize pool is total input * .99');
          return Promisify(DebugLotteryRound.prizeValue.bind(DebugLotteryRound));
        }).then(function(result) {
          assert.equal(result.equals(expectedPrizeValue), true, 'Prize value is the same as the prize pool');
          return Promisify(web3.eth.getBalance.bind(web3.eth, winner));
        }).then(function(currentBalance) {
          return Promisify(DebugLotteryRound.distributeWinnings.bind(DebugLotteryRound)).then(function(tx) {
            return getReceipt(tx);
          }).then(function(receipt) {
            // are we able to pay out?
            assert.ok(receipt.transactionHash, 'Has a transaction hash');
            assert.ok(receipt.blockNumber, 'Has a block number');
            assert.ok(receipt.blockHash, 'Has a block hash');
            return Promisify(web3.eth.getBalance.bind(web3.eth, winner));
          }).then(function(newBalance) {
            assert.equal(currentBalance.plus(expectedPrizeValue).equals(newBalance), true, 'Winner was paid');
          });
        });
      });

      it('allows the owner fee to be withdrawn after a winner is chosen', function() {
        var winningPick = '0x11223344';
        var output = accounts[5];
        var expectedPrizeValue = expectedPrizePool;
        return setWinningPick(winningPick).then(function() {
          return Promisify(web3.eth.getBalance.bind(web3.eth, output));
        }).then(function(currentBalance) {
          return Promisify(DebugLotteryRound.claimOwnerFee.bind(DebugLotteryRound, output)).then(function(tx) {
            return getReceipt(tx);
          }).then(function(receipt) {
            // are we able to pay out?
            assert.ok(receipt.transactionHash, 'Has a transaction hash');
            assert.ok(receipt.blockNumber, 'Has a block number');
            assert.ok(receipt.blockHash, 'Has a block hash');
            return Promisify(web3.eth.getBalance.bind(web3.eth, output));
          }).then(function(newBalance) {
            assert.equal(currentBalance.plus(expectedOwnerFee).equals(newBalance), true, 'Output was paid');
          });
        });
      });

      it('does not allow allows the owner fee to be withdrawn multiple times', function() {
        var winningPick = '0x11223344';
        var output = accounts[5];
        var expectedPrizeValue = expectedPrizePool;
        return setWinningPick(winningPick).then(function() {
          return Promisify(DebugLotteryRound.claimOwnerFee.bind(DebugLotteryRound, output));
        }).then(function(tx) {
          return getReceipt(tx);
        }).then(function() {
          return Promisify(web3.eth.getBalance.bind(web3.eth, output));
        }).then(function(currentBalance) {
          return Promisify(DebugLotteryRound.claimOwnerFee.bind(DebugLotteryRound, output)).then(function(tx) {
            return getReceipt(tx);
          }).then(function(receipt) {
            // are we able to pay out?
            assert.ok(receipt.transactionHash, 'Has a transaction hash');
            assert.ok(receipt.blockNumber, 'Has a block number');
            assert.ok(receipt.blockHash, 'Has a block hash');
            return Promisify(web3.eth.getBalance.bind(web3.eth, output));
          }).then(function(newBalance) {
            assert.equal(currentBalance.equals(newBalance), true, 'Output was not paid a second time');
          });
        });
      });

      it('does not allow allows the owner fee to be withdrawn if there is no winner', function() {
        var winningPick = '0x21222324';
        var output = accounts[5];
        var expectedPrizeValue = expectedPrizePool;
        return setWinningPick(winningPick).then(function() {
          return Promisify(web3.eth.getBalance.bind(web3.eth, output));
        }).then(function(currentBalance) {
          return Promisify(DebugLotteryRound.claimOwnerFee.bind(DebugLotteryRound, output)).then(function(tx) {
            return getReceipt(tx);
          }).then(function(receipt) {
            // are we able to pay out?
            assert.ok(receipt.transactionHash, 'Has a transaction hash');
            assert.ok(receipt.blockNumber, 'Has a block number');
            assert.ok(receipt.blockHash, 'Has a block hash');
            return Promisify(web3.eth.getBalance.bind(web3.eth, output));
          }).then(function(newBalance) {
            assert.equal(currentBalance.equals(newBalance), true, 'Output was not paid');
          });
        });
      });

      it('awards the whole pool to a winner who purchased two of the same picks', function() {
        var winningPick = '0x11224433';
        var winner = accounts[2];
        var expectedPrizeValue = expectedPrizePool;
        return setWinningPick(winningPick).then(function(success) {
          return getEvent(DebugLotteryRound, 'LotteryRoundWinner', success.blockNumber);
        }).then(function(results) {
          assert.equal(results.length, 1, 'Only one winner event logged');
          var result = results[0];
          assert.equal(result.args.ticketHolder, winner, 'Broadcasts the winner');
          assert.equal(result.args.picks, winningPick, 'Broadcasts the winner\'s picks');
          return Promisify(DebugLotteryRound.winningsClaimable.bind(DebugLotteryRound, winner));
        }).then(function(result) {
          assert.equal(result, true, 'Winnings are claimable by the winner');
          return Promisify(DebugLotteryRound.prizePool.bind(DebugLotteryRound));
        }).then(function(result) {
          assert.equal(result.equals(expectedPrizePool), true, 'Prize pool is total input * .99');
          return Promisify(DebugLotteryRound.prizeValue.bind(DebugLotteryRound));
        }).then(function(result) {
          assert.equal(result.equals(expectedPrizeValue), true, 'Prize value is the same as the prize pool');
          return Promisify(web3.eth.getBalance.bind(web3.eth, winner));
        }).then(function(currentBalance) {
          return Promisify(DebugLotteryRound.distributeWinnings.bind(DebugLotteryRound)).then(function(tx) {
            return getReceipt(tx);
          }).then(function(receipt) {
            // are we able to pay out?
            assert.ok(receipt.transactionHash, 'Has a transaction hash');
            assert.ok(receipt.blockNumber, 'Has a block number');
            assert.ok(receipt.blockHash, 'Has a block hash');
            return Promisify(web3.eth.getBalance.bind(web3.eth, winner));
          }).then(function(newBalance) {
            assert.equal(currentBalance.plus(expectedPrizeValue).equals(newBalance), true, 'Winner was paid');
          });
        });
      });

      it('splits the pot between two winners', function() {
        var winningPick = '0x44332211';
        var winners = [accounts[3], accounts[4]];
        var expectedPrizeValue = expectedPrizePool.dividedBy(2).floor();
        return setWinningPick(winningPick).then(function(success) {
          return getEvent(DebugLotteryRound, 'LotteryRoundWinner', success.blockNumber);
        }).then(function(results) {
          assert.equal(results.length, 2, 'Two winner events logged');
          results.forEach(function(result) {
            assert.notEqual(winners.indexOf(result.args.ticketHolder), -1, 'Broadcasts each winner');
            assert.equal(result.args.picks, winningPick, 'Broadcasts the winners\' picks');
          });
          return Promisify(DebugLotteryRound.prizePool.bind(DebugLotteryRound));
        }).then(function(result) {
          assert.equal(result.equals(expectedPrizePool), true, 'Prize pool is (total input * .99) / 2');
          return Promisify(DebugLotteryRound.winningsClaimable.bind(DebugLotteryRound, winners[0]));
        }).then(function(result) {
          assert.equal(result, true, 'Winnings are claimable by the first winner');
          return Promisify(DebugLotteryRound.winningsClaimable.bind(DebugLotteryRound, winners[1]));
        }).then(function(result) {
          assert.equal(result, true, 'Winnings are claimable by the second winner');
          return Promisify(DebugLotteryRound.prizeValue.bind(DebugLotteryRound));
        }).then(function(result) {
          assert.equal(result.equals(expectedPrizeValue), true, 'Prize value is the half the prize pool');
          return Promise.all([
            Promisify(web3.eth.getBalance.bind(web3.eth, winners[0])),
            Promisify(web3.eth.getBalance.bind(web3.eth, winners[1]))
          ]);
        }).then(function(currentBalances) {
          return Promisify(DebugLotteryRound.distributeWinnings.bind(DebugLotteryRound)).then(function(tx) {
            return getReceipt(tx);
          }).then(function(receipt) {
            // are we able to pay out?
            assert.ok(receipt.transactionHash, 'Has a transaction hash');
            assert.ok(receipt.blockNumber, 'Has a block number');
            assert.ok(receipt.blockHash, 'Has a block hash');
            return Promise.all([
              Promisify(web3.eth.getBalance.bind(web3.eth, winners[0])),
              Promisify(web3.eth.getBalance.bind(web3.eth, winners[1]))
            ]);
          }).then(function(newBalances) {
            assert.equal(currentBalances[0].plus(expectedPrizeValue).equals(newBalances[0]), true, 'First winner was paid');
            assert.equal(currentBalances[1].plus(expectedPrizeValue).equals(newBalances[1]), true, 'Second winner was paid');
          });
        });
      });
    });
  });
});
