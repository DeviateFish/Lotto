var assert = require('assert');
var Embark = require('embark');
var soliditySha3 = require('../lib/solidity-sha3');
var EmbarkSpec = Embark.initTests({
  embarkConfig: 'test/debug_lottery_round.json'
});
var web3 = EmbarkSpec.web3;

describe('DebugLotteryRound', function() {
  var salt = soliditySha3.sha3('secret');
  var N = 12;
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

  describe.skip('deployment', function() {
    before(function(done) {
      web3.eth.getAccounts(function(err, acc) {
        if (err) {
          return done(err);
        }
        var saltHash = soliditySha3.sha3(salt);
        for(var i = 1; i < N; i++) {
          saltHash = soliditySha3.sha3(saltHash);
        }
        accounts = acc;
        var contractsConfig = {
          DebugLotteryRound: {
            args: [
              saltHash,
              soliditySha3.sha3(salt, N, salt)
            ],
            gas: '4000000'
          }
        };

        EmbarkSpec.deployAll(contractsConfig, done);
      });
    });

    it('deploys successfully', function() {
      assert.notEqual(DebugLotteryRound.address, 'undefined', 'Actually is deployed');
      var saltHash = soliditySha3.sha3(salt);
      for(var i = 1; i < N; i++) {
        saltHash = soliditySha3.sha3(saltHash);
      }
      var saltNHash = soliditySha3.sha3(salt, N, salt);
      return Promisify(DebugLotteryRound.saltHash.bind(DebugLotteryRound)).then(function(contractSaltHash) {
        assert.equal(contractSaltHash, saltHash, 'saltHash is publicly verifiable');
        return Promisify(DebugLotteryRound.saltNHash.bind(DebugLotteryRound));
      }).then(function(contractSaltNHash) {
        assert.equal(contractSaltNHash, saltNHash, 'saltNHash is publicly verifiable');
      });
    });
  });

  describe.skip('deployment with initial balance', function() {
    before(function(done) {
      web3.eth.getAccounts(function(err, acc) {
        if (err) {
          return done(err);
        }
        var saltHash = soliditySha3.sha3(salt);
        for(var i = 1; i < N; i++) {
          saltHash = soliditySha3.sha3(saltHash);
        }
        accounts = acc;
        var contractsConfig = {
          DebugLotteryRound: {
            args: [
              saltHash,
              soliditySha3.sha3(salt, N, salt)
            ],
            gas: '4000000',
            value: web3.toWei(10, 'ether')
          }
        };

        EmbarkSpec.deployAll(contractsConfig, done);
      });
    });

    it('deploys successfully', function() {
      assert.notEqual(DebugLotteryRound.address, 'undefined', 'Actually is deployed');
      var saltHash = soliditySha3.sha3(salt);
      for(var i = 1; i < N; i++) {
        saltHash = soliditySha3.sha3(saltHash);
      }
      var saltNHash = soliditySha3.sha3(salt, N, salt);
      return Promisify(DebugLotteryRound.saltHash.bind(DebugLotteryRound)).then(function(contractSaltHash) {
        assert.equal(contractSaltHash, saltHash, 'saltHash is publicly verifiable');
        return Promisify(DebugLotteryRound.saltNHash.bind(DebugLotteryRound));
      }).then(function(contractSaltNHash) {
        assert.equal(contractSaltNHash, saltNHash, 'saltNHash is publicly verifiable');
      });
    });
  });

  describe.skip('buying tickets', function() {

    before(function(done) {
      web3.eth.getAccounts(function(err, acc) {
        if (err) {
          return done(err);
        }
        var saltHash = soliditySha3.sha3(salt);
        for(var i = 1; i < N; i++) {
          saltHash = soliditySha3.sha3(saltHash);
        }
        accounts = acc;
        var contractsConfig = {
          DebugLotteryRound: {
            args: [
              saltHash,
              soliditySha3.sha3(salt, N, salt)
            ],
            gas: '4000000'
          }
        };

        EmbarkSpec.deployAll(contractsConfig, done);
      });
    });

    it('Rejects picks when no payment is provided', function() {
      return Promisify(DebugLotteryRound.pickTicket.bind(DebugLotteryRound, '0x11223344', { from: accounts[1] })).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assert.notEqual(err, undefined, 'Should thrown an error');
      });
    });

    it('Accepts specific picks when payment is provided', function() {
      var pick = '0x11223344';
      return Promisify(DebugLotteryRound.pickTicket.bind(DebugLotteryRound, pick, { value: web3.toWei(1, 'finney'), from: accounts[1] })).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.notEqual(success, undefined, 'Should succeed.');
        return getEvent(DebugLotteryRound, 'LotteryRoundDraw', success.blockNumber);
      }).then(function(results) {
        assert.equal(results.length, 1, 'Only one event logged');
        var result = results[0];
        assert.equal(result.args.picks, pick, 'Logs the picked number');
        assert.equal(result.args.ticketHolder, accounts[1], 'Logs the proper ticketholder');
      });
    });

    it('Allows duplicate specific picks from different users', function() {
      var pick = '0x23456701';
      return Promisify(DebugLotteryRound.pickTicket.bind(DebugLotteryRound, pick, { value: web3.toWei(1, 'finney'), from: accounts[1] })).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.notEqual(success, undefined, 'Should succeed.');
        return getEvent(DebugLotteryRound, 'LotteryRoundDraw', success.blockNumber);
      }).then(function(results) {
        assert.equal(results.length, 1, 'Only one event logged');
        var result = results[0];
        assert.equal(result.args.picks, pick, 'Logs the picked number');
        assert.equal(result.args.ticketHolder, accounts[1], 'Logs the proper ticketholder');
      }).then(function() {
        return Promisify(DebugLotteryRound.pickTicket.bind(DebugLotteryRound, pick, { value: web3.toWei(1, 'finney'), from: accounts[2] }));
      }).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.notEqual(success, undefined, 'Should succeed.');
        return getEvent(DebugLotteryRound, 'LotteryRoundDraw', success.blockNumber);
      }).then(function(results) {
        assert.equal(results.length, 1, 'Only one event logged');
        var result = results[0];
        assert.equal(result.args.picks, pick, 'Logs the picked number');
        assert.equal(result.args.ticketHolder, accounts[2], 'Logs the proper ticketholder');
      });
    });

    it('Allows duplicate specific picks from the same user', function() {
      var pick = '0x00112233';
      return Promisify(DebugLotteryRound.pickTicket.bind(DebugLotteryRound, pick, { value: web3.toWei(1, 'finney'), from: accounts[1] })).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.notEqual(success, undefined, 'Should succeed.');
        return getEvent(DebugLotteryRound, 'LotteryRoundDraw', success.blockNumber);
      }).then(function(results) {
        assert.equal(results.length, 1, 'Only one event logged');
        var result = results[0];
        assert.equal(result.args.picks, pick, 'Logs the picked number');
        assert.equal(result.args.ticketHolder, accounts[1], 'Logs the proper ticketholder');
      }).then(function() {
        return Promisify(DebugLotteryRound.pickTicket.bind(DebugLotteryRound, pick, { value: web3.toWei(1, 'finney'), from: accounts[1] }));
      }).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.notEqual(success, undefined, 'Should succeed.');
        return getEvent(DebugLotteryRound, 'LotteryRoundDraw', success.blockNumber);
      }).then(function(results) {
        assert.equal(results.length, 1, 'Only one event logged');
        var result = results[0];
        assert.equal(result.args.picks, pick, 'Logs the picked number');
        assert.equal(result.args.ticketHolder, accounts[1], 'Logs the proper ticketholder');
      });
    });

    it('Rejects specific picks picks are out of bounds', function() {
      var pick = '0x81223344';
      return Promisify(DebugLotteryRound.pickTicket.bind(DebugLotteryRound, pick, { value: web3.toWei(1, 'finney'), from: accounts[1] })).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assert.notEqual(err, undefined, 'Should thrown an error');
      });
    });

    it('Rejects random picks when no payment is provided', function() {
      return Promisify(DebugLotteryRound.randomTicket.bind(DebugLotteryRound, { from: accounts[1] })).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        assert.notEqual(err, undefined, 'Should thrown an error');
      });
    });

    it('Accepts random picks when payment is provided', function() {
      return Promisify(DebugLotteryRound.randomTicket.bind(DebugLotteryRound, { value: web3.toWei(1, 'finney'), from: accounts[1] })).then(function(receipt) {
        return getReceipt(receipt);
      }).then(function(success) {
        assert.notEqual(success, undefined, 'Should succeed.');
        return getEvent(DebugLotteryRound, 'LotteryRoundDraw', success.blockNumber);
      }).then(function(results) {
        assert.equal(results.length, 1, 'Only one event logged');
        var result = results[0];
        assert.equal(web3.toDecimal(result.args.picks), web3.toDecimal(result.args.picks) & 0x7f7f7f7f, 'Picks satisfy valid picks requirement');
        assert.equal(result.args.ticketHolder, accounts[1], 'Logs the proper ticketholder');
      });
    });
  });

  describe('picking winning numbers', function() {
    before(function(done) {
      web3.eth.getAccounts(function(err, acc) {
        if (err) {
          return done(err);
        }
        var saltHash = soliditySha3.sha3(salt);
        for(var i = 1; i < N; i++) {
          saltHash = soliditySha3.sha3(saltHash);
        }
        accounts = acc;
        var contractsConfig = {
          DebugLotteryRound: {
            args: [
              saltHash,
              soliditySha3.sha3(salt, N, salt)
            ],
            gas: '4000000',
            value: web3.toWei(10, 'ether')
          }
        };

        console.log(saltHash, soliditySha3.sha3(salt, N, salt));
        console.log(web3.fromDecimal(N), soliditySha3.sha3(salt, web3.fromDecimal(N), salt));
        console.log('0x0c', soliditySha3.sha3(salt, '0x0c', salt));
        console.log(soliditySha3.sha3(web3.toAscii(salt), '0x0c', web3.toAscii(salt)));
        console.log(salt, N);

        return new Promise(function(resolve) {
          EmbarkSpec.deployAll(contractsConfig, function() {
            resolve();
          });
        }).then(function() {
          return Promisify(DebugLotteryRound.forceClose.bind(DebugLotteryRound));
        }).then(function(receipt) {
          return getReceipt(receipt);
        }).then(function(status) {
          console.log(status.blockNumber);
          done();
        });
      });
    });

    it('does not pick numbers if the salt does not match', function() {
      var fakeSalt = soliditySha3.sha3('secret2');
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
        console.log(success);
        assert.equal(success, undefined, 'Should not succeed.');
      }).catch(function(err) {
        console.log(err);
        assert.notEqual(err, undefined, 'Should thrown an error');
      });
    });
  });
});
