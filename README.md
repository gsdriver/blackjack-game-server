# blackjack-game-server
Node application for a blackjack game that offers advice for different rule sets
The service returns JSON objects representing the state of the game
and accepts POST requests to perform actions or return recommended player actions
You can use in conjunction with the angular-powered HTML file provided in html\index.htm
to play a full game in your browser
 
# Usage

You will need to run a redis server and update config.redisHost in src\config.js to point to the endpoint.
The server maintains all of the game state, allowing the client to simply render the returned JSON game
and further the game by allowing the player to post an action back to the server.  The format of the JSON
that is returned is as follows:

```
gameState = {
    "userID":string,                 // Represents the ID of the game; pass this in with subsequent POSTs
    "activePlayer":string,           // The active player - none, player, or dealer
    "currentPlayerHand":integer,     // 0-based index of the player hand currently in play
    "bankroll":integer,              // The player's bankroll
    "possibleActions":string[],      // An array of strings representing possible actions the player can take:
                                     //   insurance, noinsurance, surrender, double, split, hit, stand,
                                     //   bet, shuffle, or resetbankroll (after the player runs out of money)
    "dealerHand":{
            outcome:string,          // The outcome after the dealer peeked at their hole card for a blackjack:
                                     //   dealerblackjack, nodealerplayerjack, or playing
            cards:[
                {rank: integer,      // Rank of the card from 1 (Ace) - 13 (King)
                 suit: string}       // Suit: clubs, diamonds, hearts, or spades
            ]
        },
    "playerHands":[
            outcome:string,          // The outcome of the player's hand:
                                     //    playing, surrender, blackjack, win, loss, push
            bet:integer,             // The amount bet on this hand
            busted:boolean,          // Whether the player busted this hand
            cards:[
                {rank: integer,      // Rank of the card from 1 (Ace) - 13 (King)
                 suit: string}       // Suit: clubs, diamonds, hearts, or spades
        ],
    "lastBet":integer,               // The player's initial bet on the previous hand
    "houseRules": {
            hitSoft17:boolean,        // Does dealer hit soft 17
            surrender:string,         // Surrender offered - none, late, or early
            double:string,            // Double rules - none, 10or11, 9or10or11, any
            doubleaftersplit:boolean, // Can double after split
            resplitAces:boolean,      // Can you resplit aces
            blackjackBonus:decimal,   // Bonus for player blackjack, usually 0.5 or 0.2
            numberOfDecks:1,          // Number of decks in play
            minBet:5,                 // The minimum bet - not configurable
            maxBet:1000,              // The maximum bet - not configurable
            maxSplitHands:4           // Maximum number of hands you can have due to splits
        }
};

```

After retrieving the gameState, the client communicates with the server by issuing a POST command.
Each of these commands expects a payload key/value pair containing the userID field from the JSON
object retrieved from the previous GET command.  The first list of commands can only be accepted 
if set in the possibleActions array.  The return value for all of these is a JSON object representing
the new game state after taking this action:

 * `hit` - The player will take another card
 * `stand` - The player will stay on this hand
 * `split` - The player will split a pair to create an additional hand
 * `double` - The bet on this hand will be doubled and one additional card will be drawn
 * `surrender` - The player will surrender this hand
 * `insurance` - The player wants to take insurance
 * `noinsurance` - The player doesn't want to take insurance
 * `bet` - Deal a new hand (this option will take an additional key/value pair 
                            of the form "value=X" where X is the amount of the bet)

In addition, you can post the following commands:

 * `suggest` - Make a suggestion of what the user should do for this hand; return value is a JSON object
             with field "suggestion" set to one of the possibleAction values, and "error" set to an error string if applicable
 * `setrules` - Change the rules in play.  The payload will be an ampersand-delimited string of key/value pairs
              corresponding to the `houseRules` field listed above.  Changing the rules forces a shuffle;
              the return value is a JSON object with the new gameState (noting the shuffle)

# Contributing - bug fixes

Contributions are welcome!  Please feel free to fork this code and submit pull requests, for bug fixes or feature enhancements.

 1. Fork it!
 2. Create your featured branch: `git checkout -b my-feature`
 3. Commit your changes: `git commit -m 'add some feature'`
 4. Push to the branch: `git push origin my-feature`
 5. Submit a pull request

Many Thanks!
