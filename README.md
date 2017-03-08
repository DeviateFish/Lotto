# Lotto

A simple (but upgradeable) lottery contract on Ethereum.

Deployed at [`0x58B79dFe37D3eD6b44582fb0C6591680C3d51DB8`](https://etherscan.io/address/0x58B79dFe37D3eD6b44582fb0C6591680C3d51DB8)

## Current rules:

- Ticket price: 1 finney
- Number of picks: 4
- Range of picks: 0-63 (2^6)
- Round length: 43,200 blocks (~7 days)
- Owner fee: 5%

Tickets can be purchased from the current round by sending the ticket price to either the `pickTicket` or `randomTicket` methods.  For `pickTicket`, the picks must be expressed as a 4-byte hexadecimal number (e.g. `0x01020304`).

At the close of a round, the hidden entropy source is revealed, and winning numbers picked.  If your picks match the winning number, you win a share of the pot (proportional to the number of winners).  The current odds stand somewhere around 1:16M (1 in (2^6)^4)

## ABIs:

Abbreviated ABIs.  Full ABIs can be found in `app/abis`

Lotto ABI:  
```
[{"constant":true,"inputs":[],"name":"gameLogic","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"currentRound","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"previousRounds","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"previousRoundsCount","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"payable":false,"type":"fallback"}]
```

LotteryRound ABI: 
```
[{"constant":true,"inputs":[],"name":"winningNumbers","outputs":[{"name":"","type":"bytes4"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"closingBlock","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"randomTicket","outputs":[],"payable":true,"type":"function"},{"constant":true,"inputs":[],"name":"saltNHash","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"saltHash","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"claimPrize","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"prizePool","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"prizeValue","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"winners","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"picks","type":"bytes4"}],"name":"pickTicket","outputs":[],"payable":true,"type":"function"},{"constant":true,"inputs":[{"name":"salt","type":"bytes32"},{"name":"N","type":"uint8"}],"name":"proofOfSalt","outputs":[{"name":"","type":"bool"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"winningsClaimable","outputs":[{"name":"","type":"bool"}],"payable":false,"type":"function"},{"payable":false,"type":"fallback"},{"anonymous":false,"inputs":[{"indexed":false,"name":"saltHash","type":"bytes32"},{"indexed":false,"name":"saltNHash","type":"bytes32"},{"indexed":false,"name":"closingBlock","type":"uint256"},{"indexed":false,"name":"version","type":"string"}],"name":"LotteryRoundStarted","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"ticketHolder","type":"address"},{"indexed":true,"name":"picks","type":"bytes4"}],"name":"LotteryRoundDraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"salt","type":"bytes32"},{"indexed":false,"name":"N","type":"uint8"},{"indexed":true,"name":"winningPicks","type":"bytes4"}],"name":"LotteryRoundCompleted","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"ticketHolder","type":"address"},{"indexed":true,"name":"picks","type":"bytes4"}],"name":"LotteryRoundWinner","type":"event"}]
```

## Playing with Ethereum Wallet:

To play, watch the Lotto contract with the provided Lotto ABI.  Query the contract for the current round, and watch this address with the `LotteryRound` ABI.

If you'd like, you can watch the contract for events, as well.

To pick tickets, call `pickTicket`, send along 1 finney (the current ticket price) and specify your 4 picks (0-63) as a 4-byte hexadecimal number (e.g. `0x01020304`).  Picks must be between 0 and 63 (inclusive, and in hex: `0x00` to `0x3f`).

To get a randomly-selected ticket, call `randomTicket`, sending along 1 finney (the current ticket price).

## Playing with Mist:

Coming soon

## Playing with Metamask:

Coming soon
