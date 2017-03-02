var assert = require('assert');
var Embark = require('embark');
var sha3Utils = require('../lib/sha3-utils');
var EmbarkSpec = Embark.initTests({
  embarkConfig: 'test/configs/lottery_round.json'
});
var web3 = EmbarkSpec.web3;

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
      return Promisify(LotteryRound.saltHash.bind(LotteryRound)).then(function(contractSaltHash) {
        assert.equal(contractSaltHash, saltHash, 'saltHash is publicly verifiable');
        return Promisify(LotteryRound.saltNHash.bind(LotteryRound));
      }).then(function(contractSaltNHash) {
        assert.equal(contractSaltNHash, saltNHash, 'saltNHash is publicly verifiable');
      });
    });

    it('has a verifiable salt and N', function() {
      return Promisify(LotteryRound.proofOfSalt.bind(LotteryRound, salt, N)).then(function(result) {
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
      return Promisify(LotteryRound.saltHash.bind(LotteryRound)).then(function(contractSaltHash) {
        assert.equal(contractSaltHash, saltHash, 'saltHash is publicly verifiable');
        return Promisify(LotteryRound.saltNHash.bind(LotteryRound));
      }).then(function(contractSaltNHash) {
        assert.equal(contractSaltNHash, saltNHash, 'saltNHash is publicly verifiable');
      });
    });

    it('has a verifiable salt and N', function() {
      return Promisify(LotteryRound.proofOfSalt.bind(LotteryRound, salt, N)).then(function(result) {
        assert.equal(result, true, 'Salt is verifiable');
      });
    });
  });

  describe('buying tickets', function() {

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
      return Promisify(LotteryRound.pickTicket.bind(LotteryRound, '0x11223344', { from: accounts[1], gas: '1000000' })).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assert.notEqual(err, undefined, 'Should thrown an error');
      });
    });

    it('Accepts specific picks when payment is provided', function() {
      var pick = '0x11223344';
      return Promisify(LotteryRound.pickTicket.bind(LotteryRound, pick, { value: web3.toWei(1, 'finney'), from: accounts[1], gas: '1000000' })).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.notEqual(success, undefined, 'Should succeed.');
        return getEvent(LotteryRound, 'LotteryRoundDraw', success.blockNumber);
      }).then(function(results) {
        assert.equal(results.length, 1, 'Only one event logged');
        var result = results[0];
        assert.equal(result.args.picks, pick, 'Logs the picked number');
        assert.equal(result.args.ticketHolder, accounts[1], 'Logs the proper ticketholder');
      });
    });

    it('Allows duplicate specific picks from different users', function() {
      var pick = '0x23456701';
      return Promisify(LotteryRound.pickTicket.bind(LotteryRound, pick, { value: web3.toWei(1, 'finney'), from: accounts[1], gas: '1000000' })).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.notEqual(success, undefined, 'Should succeed.');
        return getEvent(LotteryRound, 'LotteryRoundDraw', success.blockNumber);
      }).then(function(results) {
        assert.equal(results.length, 1, 'Only one event logged');
        var result = results[0];
        assert.equal(result.args.picks, pick, 'Logs the picked number');
        assert.equal(result.args.ticketHolder, accounts[1], 'Logs the proper ticketholder');
      }).then(function() {
        return Promisify(LotteryRound.pickTicket.bind(LotteryRound, pick, { value: web3.toWei(1, 'finney'), from: accounts[2], gas: '1000000' }));
      }).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.notEqual(success, undefined, 'Should succeed.');
        return getEvent(LotteryRound, 'LotteryRoundDraw', success.blockNumber);
      }).then(function(results) {
        assert.equal(results.length, 1, 'Only one event logged');
        var result = results[0];
        assert.equal(result.args.picks, pick, 'Logs the picked number');
        assert.equal(result.args.ticketHolder, accounts[2], 'Logs the proper ticketholder');
      });
    });

    it('Allows duplicate specific picks from the same user', function() {
      var pick = '0x00112233';
      return Promisify(LotteryRound.pickTicket.bind(LotteryRound, pick, { value: web3.toWei(1, 'finney'), from: accounts[1], gas: '1000000' })).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.notEqual(success, undefined, 'Should succeed.');
        return getEvent(LotteryRound, 'LotteryRoundDraw', success.blockNumber);
      }).then(function(results) {
        assert.equal(results.length, 1, 'Only one event logged');
        var result = results[0];
        assert.equal(result.args.picks, pick, 'Logs the picked number');
        assert.equal(result.args.ticketHolder, accounts[1], 'Logs the proper ticketholder');
      }).then(function() {
        return Promisify(LotteryRound.pickTicket.bind(LotteryRound, pick, { value: web3.toWei(1, 'finney'), from: accounts[1], gas: '1000000' }));
      }).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.notEqual(success, undefined, 'Should succeed.');
        return getEvent(LotteryRound, 'LotteryRoundDraw', success.blockNumber);
      }).then(function(results) {
        assert.equal(results.length, 1, 'Only one event logged');
        var result = results[0];
        assert.equal(result.args.picks, pick, 'Logs the picked number');
        assert.equal(result.args.ticketHolder, accounts[1], 'Logs the proper ticketholder');
      });
    });

    it('Rejects specific picks picks are out of bounds', function() {
      var pick = '0x81223344';
      return Promisify(LotteryRound.pickTicket.bind(LotteryRound, pick, { value: web3.toWei(1, 'finney'), from: accounts[1] })).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assert.notEqual(err, undefined, 'Should thrown an error');
      });
    });

    it('Rejects random picks when no payment is provided', function() {
      return Promisify(LotteryRound.randomTicket.bind(LotteryRound, { from: accounts[1] })).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assert.notEqual(err, undefined, 'Should thrown an error');
      });
    });

    it('Accepts random picks when payment is provided', function() {
      return Promisify(LotteryRound.randomTicket.bind(LotteryRound, { value: web3.toWei(1, 'finney'), from: accounts[1] })).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.notEqual(success, undefined, 'Should succeed.');
        return getEvent(LotteryRound, 'LotteryRoundDraw', success.blockNumber);
      }).then(function(results) {
        assert.equal(results.length, 1, 'Only one event logged');
        var result = results[0];
        assert.equal(web3.toDecimal(result.args.picks), web3.toDecimal(result.args.picks) & 0x7f7f7f7f, 'Picks satisfy valid picks requirement');
        assert.equal(result.args.ticketHolder, accounts[1], 'Logs the proper ticketholder');
      });
    });
  });
});
