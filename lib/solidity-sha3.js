var Web3 = require('web3');
var leftPad = require('left-pad');
var web3 = new Web3();

// the size of a character in a hex string in bytes
var HEX_CHAR_SIZE = 4;

// the size to hash an integer if not explicity provided
var DEFAULT_SIZE = 256;

/** Encodes a value in hex and adds padding to the given size if needed. Tries to determine whether it should be encoded as a number or string. Curried args. */
function encodeWithPadding(size) {
  return function encode(value) {
    if (typeof(value) === 'string') {
      return web3.toHex(value);
    } else {
      return encodeNum(size)(value);
    }
  };
}

/** Encodes a number in hex and adds padding to the given size if needed. Curried args. */
function encodeNum(size) {
  return function encode(value) {
    return leftPad(
      web3.toHex(value < 0 ? value >>> 0 : value).slice(2),
      size / HEX_CHAR_SIZE,
      value < 0 ? 'F' : '0'
    );
  };
}

/** Hashes one or more arguments, using a default size for numbers. */
function sha3() {
  var args = Array.prototype.slice.call(arguments);
  var paddedArgs = args.map(encodeWithPadding(DEFAULT_SIZE)).join('');
  console.log(paddedArgs);
  return web3.sha3(paddedArgs, { encoding: 'hex' });
}

/** Hashes a single value at the given size. */
function sha3withsize(value, size) {
  var paddedArgs = encodeWithPadding(size)(value);
  return web3.sha3(paddedArgs, { encoding: 'hex' });
}

function sha3num(value, size) {
  if (size === undefined) {
    size = DEFAULT_SIZE;
  }
  var paddedArgs = encodeNum(size)(value);
  return web3.sha3(paddedArgs, { encoding: 'hex' });
}

module.exports = {
  sha3: sha3,
  sha3withsize: sha3withsize,
  sha3num: sha3num
};
