var assert = require('assert');
var Embark = require('embark');
var sha3Utils = require('../../lib/sha3-utils');
var EmbarkSpec = Embark.initTests({
  embarkConfig: 'test/configs/lottery_round.json'
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


describe('LotteryRound', function() {
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

  function pickTicket(pick, from) {
    return Promisify(
      LotteryRound.pickTicket.bind(
        LotteryRound,
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
      LotteryRound.randomTicket.bind(
        LotteryRound,
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
    return Promisify(LotteryRound.saltHash.bind(LotteryRound));
  }

  function getSaltNHash() {
    return Promisify(LotteryRound.saltNHash.bind(LotteryRound));
  }

  function getProofOfSalt(_salt, _N) {
    return Promisify(LotteryRound.proofOfSalt.bind(LotteryRound, _salt, _N));
  }

  function validateDrawEvent(account, pick, blockNumber) {
    return getEvent(LotteryRound, 'LotteryRoundDraw', blockNumber).then(function(results) {
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
        LotteryRound: {
          args: [
            saltHash,
            saltNHash
          ],
          gas: '3000000'
        }
      };

      EmbarkSpec.deployAll(contractsConfig, done);
    });

    it('deploys successfully', function() {
      assert.notEqual(LotteryRound.address, 'undefined', 'Actually is deployed');
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
        LotteryRound: {
          args: [
            saltHash,
            saltNHash
          ],
          gas: '3000000',
          value: web3.toWei(10, 'ether')
        }
      };

      EmbarkSpec.deployAll(contractsConfig, done);
    });

    it('deploys successfully', function() {
      assert.notEqual(LotteryRound.address, 'undefined', 'Actually is deployed');
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

  describe('.pickTicket', function() {

    before(function(done) {
      var contractsConfig = {
        LotteryRound: {
          args: [
            saltHash,
            saltNHash
          ],
          gas: '3000000'
        }
      };

      EmbarkSpec.deployAll(contractsConfig, done);
    });

    it('Rejects picks when no payment is provided', function() {
      return Promisify(LotteryRound.pickTicket.bind(LotteryRound, '0x11223344', { from: accounts[1], gas: '1000000' })).then(function(txhash) {
        assert.equal(txhash, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('Accepts specific picks when payment is provided', function() {
      var pick = '0x11223344';
      return pickTicket(pick, accounts[1]).then(function(receipt) {
        assertGoodReceipt(receipt);
        return validateDrawEvent(accounts[1], pick, receipt.blockNumber);
      });
    });

    it('Allows duplicate specific picks from different users', function() {
      var pick = '0x23456701';
      return pickTicket(pick, accounts[1]).then(function(receipt) {
        assertGoodReceipt(receipt);
        return validateDrawEvent(accounts[1], pick, receipt.blockNumber);
      }).then(function() {
        return pickTicket(pick, accounts[2]);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return validateDrawEvent(accounts[2], pick, receipt.blockNumber);
      });
    });

    it('Allows duplicate specific picks from the same user', function() {
      var pick = '0x00112233';
      return pickTicket(pick, accounts[1]).then(function(receipt) {
        assertGoodReceipt(receipt);
        return validateDrawEvent(accounts[1], pick, receipt.blockNumber);
      }).then(function() {
        return pickTicket(pick, accounts[1]);
      }).then(function(receipt) {
        assertGoodReceipt(receipt);
        return validateDrawEvent(accounts[1], pick, receipt.blockNumber);
      });
    });

    it('Rejects specific picks picks are out of bounds', function() {
      var pick = '0x81223344';
      return pickTicket(pick, accounts[1]).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });
  });

  describe('.randomTicket', function() {

    before(function(done) {
      var contractsConfig = {
        LotteryRound: {
          args: [
            saltHash,
            saltNHash
          ],
          gas: '3000000'
        }
      };

      EmbarkSpec.deployAll(contractsConfig, done);
    });

    it('Rejects random picks when no payment is provided', function() {
      return Promisify(LotteryRound.randomTicket.bind(LotteryRound, { from: accounts[1] })).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assertInvalidJump(err);
      });
    });

    it('Accepts random picks when payment is provided', function() {
      return randomTicket(accounts[1]).then(function(receipt) {
        assertGoodReceipt(receipt);
        return validateDrawEvent(accounts[1], null, receipt.blockNumber);
      });
    });

    // make some vague assertions about the quality of the RNG
    // In order to make this a more rigorous test, the number of rounds
    // can be increased drastically, and similar assertions made.
    it('consistently produces valid results', function() {
      var rounds = 100;
      var picks = {};
      return Array.apply(null, Array(rounds)).reduce(function(p, _) {
        return p.then(function() {
          return randomTicket(accounts[1]).then(function(receipt) {
            assertGoodReceipt(receipt);
            return validateDrawEvent(accounts[1], null, receipt.blockNumber);
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

});
