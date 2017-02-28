var Web3 = require('web3');
var hexMatch = /^0x/;
var web3 = new Web3();

function trim(input) {
  return input.slice(2);
}

function packHex() {
  var args = Array.prototype.slice.call(arguments);
  return '0x' + args.map(trim).join('');
}

function strFill(n, v) {
  return Array.apply(null, Array(n)).map(function() {
    return v;
  }).join('');
}

function uintToHex(num, bits) {
  var hex = web3.toHex(num).slice(2);
  if (hex.length > (bits / 4)) {
    return '0x' + hex.slice(-(bits / 4));
  }
  return '0x' + strFill((bits / 4) - hex.length, '0') + hex;
}

module.exports = {
  packHex: packHex,
  uintToHex: uintToHex
};
