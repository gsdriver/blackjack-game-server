//
// This is the Game Service module
//

// Redis cache
var redis = require('redis');
//var gameCache = redis.createClient({host:'bj-tutor-redis.djyehr.0001.usw2.cache.amazonaws.com'}); 
var gameCache = redis.createClient();

gameCache.on('connect', function() {
    console.log('Redis connected');
});

// These will go into a rule file at some point
var defaultRules = {hitSoft17:false,         // Does dealer hit soft 17
             surrender:"late",        // Surrender offered - none, late, or early
             double:"any",            // Double rules - none, 10or11, 9or10or11, any
             doubleaftersplit:"any",  // Can double after split - none, 10or11, 9or10or11, any
             resplitAces:false,       // Can you resplit aces
             blackjackBonus:0.5,      // Bonus for player blackjack, usually 0.5 or 0.2
             numberOfDecks:1,         // Number of decks in play
             minBet:5,                // The minimum bet - not configurable
             maxBet:1000              // The maximum bet - not configurable
             };

// Other configurations
const maxSplitHands = 4;
const minBet = 5;
const maxBet = 1000;
const cardsBeforeShuffle = 20;
const startingBankroll = 5000;
const startingBet = 100;

/*
 * Exported functions
 */

module.exports = {
    GetGameState: function (guid, callback) {
        var game; // The internal, full state of the game

        gameCache.get(guid, function(error, result)
        {
            if (result)
            {
                game = JSON.parse(result);
            }
            else
            {
                // Oh, it doesn't exist - so we'll start a new game and save to cache
                game = InitializeGame();
                gameCache.set(guid, JSON.stringify(game));
                gameCache.expire(guid, 60*60*24); // Expire this session after one day
            }

            // Let's return this
            callback(GetGameJSONResponse(game, null));
        });
    },
    UserAction: function (guid, action, value, callback) {
        // Get the game from the cache
        gameCache.get(guid, function(error, result)
        {
            if (result)
            {
                game = JSON.parse(result);
            }
            else
            {
                // This is an error condition - we can't take action if we can't look-up in the cache
                // It probably means that the client needs to clear their cookies
                // Yeah, I should do better error handling
                callback(null);
                return;
            }

            // Is this a valid action?
            if ((action != "setrules") && (game.possibleActions.indexOf[action] < 0))
            {
                // I'm sorry Dave, I can't do that
                callback(GetGameJSONResponse(game, "invalidaction"));
                return;    
            }

            // OK, take action
            switch (action)
            {
                case "setrules":
                    // BUBGUB -- There has got to be a better way to copy and validate this user input
                    game.rules = value;

                    // Note minBet and maxBet are not to be impacted
                    game.rules.minBet = minBet;
                    game.rules.maxBet = maxBet;

                    // Empty the deck and set the player to "none"
                    game.deck.cards = [];
                    game.activePlayer = "none";
                    break;

                case "resetbankroll":
                    // Reset the bankroll
                    game.bankroll = startingBankroll;
                    break;

                case "shuffle":
                    // In this case shuffle, then the player can bet
                    ShuffleDeck(game);
                    break;

                case "bet":
                    // Validate the bet and deal the next hand
                    if (value < minBet)
                    {
                        callback(GetGameJSONResponse(game, "bettoosmall"));
                        return;
                    }
                    else if (value > game.bankroll)
                    {
                        callback(GetGameJSONResponse(game, "betoverbankroll"));
                        return;
                    }
                    else if (value > maxBet)
                    {
                        callback(GetGameJSONResponse(game, "bettoolarge"));
                        return;
                    }
                    Deal(game, value);
                    break;

                case "hit":
                    // Pop the top card off the deck for the player
                    game.playerHands[game.currentPlayerHand].cards.push(game.deck.cards.shift());

                    // If they busted, it is the dealer's turn
                    if (HandTotal(game.playerHands[game.currentPlayerHand].cards) > 21)
                    {
                        // Sorry, you lose - it's the dealer's turn now
                        game.playerHands[game.currentPlayerHand].busted = true;
                        NextHand(game);
                    }
                    break;

                case "stand":
                    // Move to the next player
                    NextHand(game);
                    break;

                case "insurance":
                    // If they are taking insurance, deduct the amount from the bankroll
                    game.bankroll -= (game.playerHands[game.currentPlayerHand].bet / 2);
                    // FALL THROUGH!
                case "noinsurance":
                    // OK, check if the dealer has 21 - if so, game is over
                    game.specialState = action;
                    if (HandTotal(game.dealerHand.cards) == 21)
                    {
                        // Game over (go to the dealer)
                        game.dealerHand.outcome = "dealerblackjack";
                        NextHand(game);
                    }
                    else
                    {
                        // Let the player know there was no blackjack
                        game.dealerHand.outcome = "nodealerblackjack";
                    }
                    break;

                case "surrender":
                    // Well, that's that
                    game.bankroll -= (game.playerHands[game.currentPlayerHand].bet / 2);
                    game.specialState = action;
                    NextHand(game);
                    break;

                case "double":
                    // For this, we mimick a hit and a stand, and set the special state to doubled
                    game.bankroll -= game.playerHands[game.currentPlayerHand].bet;
                    game.playerHands[game.currentPlayerHand].bet *= 2;
                    game.playerHands[game.currentPlayerHand].cards.push(game.deck.cards.shift());
                    NextHand(game);
                    break;

                case "split":
                    // OK, split these cards into another hand
                    var newHand = {bet:game.playerHands[game.currentPlayerHand].bet, busted:false, cards:[]};

                    game.bankroll -= newHand.bet;
                    newHand.cards.push(game.playerHands[game.currentPlayerHand].cards.shift());

                    // Pop the top card off the deck back into the current hand
                    game.playerHands[game.currentPlayerHand].cards.push(game.deck.cards.shift());

                    // And add this to the player's hand.  Whew
                    game.playerHands.push(newHand);
                    break;

                default:
                    // Hmm .. how did this not get caught above?
                    callback(null);
                    return;
            }

            // If it's the dealer's turn, then we'll play the dealer hand, unless the player already busted
            if (game.activePlayer == "dealer")
            {
                PlayDealerHand(game);  
                
                for (var i = 0; i < game.playerHands.length; i++)
                {  
                    DetermineWinner(game, game.playerHands[i]);
                }
            }

            // Now figure out what the next possible actions are and write the new state back to cache
            SetNextActions(game);
            gameCache.set(guid, JSON.stringify(game));

            // We're done!
            callback(GetGameJSONResponse(game, null));
        });
    }
}; 

/*
 * Internal functions
 */

function GetGameJSONResponse(game, error)
{
    // OK, copy over the relevant information into the JSON object that will be returned
    var gameState = {"activePlayer":game.activePlayer,
                        "currentPlayerHand":game.currentPlayerHand,
                        "bankroll":game.bankroll,
                        "possibleActions":game.possibleActions,
                        "dealerHand":{outcome:game.dealerHand.outcome, cards:[]},
                        "playerHands":game.playerHands,
                        "lastBet":game.lastBet,
                        "houseRules":game.rules,
                        "error":error};

    // Need to copy over the dealer hand (don't show the hole card if it shouldn't be shown)
    var i = 0;
    if ((game.activePlayer == "player") && game.dealerHand.cards.length)
    {
        // Pop the "empty card"
        gameState.dealerHand.cards.push({"rank":0, "suit":"none"});
        i = 1;
    }
    for (; i < game.dealerHand.cards.length; i++)
    {
        var card = {"rank":game.dealerHand.cards[i].rank, "suit":game.dealerHand.cards[i].suit};

        gameState.dealerHand.cards.push(card);
    }

    return gameState;
}

function Deal(game, betAmount)
{
    var newHand = {bet:0, busted:false, cards:[]};

    // Make sure the betAmount is valid
    newHand.bet = Number(betAmount);
    game.bankroll -= newHand.bet;
    newHand.outcome = "playing";

    // Clear out the hands
    game.dealerHand.cards = [];
    game.playerHands = [];

    // Now deal the cards
    newHand.cards.push(game.deck.cards.shift());
    game.dealerHand.cards.push(game.deck.cards.shift());
    newHand.cards.push(game.deck.cards.shift());
    game.dealerHand.cards.push(game.deck.cards.shift());
    game.playerHands.push(newHand);

    // Reset state variables
    game.specialState = null;
    game.lastBet = betAmount;
    game.dealerHand.outcome = "playing";

    // And set the next hand (to the player)
    game.activePlayer = "none";
    NextHand(game);
}

function ShuffleDeck(game)
{
    // Start by initializing the deck
    game.deck.cards = [];
    for (var i = 0; i < game.rules.numberOfDecks; i++)
    {
        for (var rank = 1; rank <= 13; rank++)
        {
            var club = {"rank":rank, "suit":"clubs"};
            var diamond = {"rank":rank, "suit":"diamonds"};
            var hearts = {"rank":rank, "suit":"hearts"};
            var spades = {"rank":rank, "suit":"spades"};
            game.deck.cards.push(club);
            game.deck.cards.push(diamond);
            game.deck.cards.push(hearts);
            game.deck.cards.push(spades);
        }
    }

    // OK, let's shuffle the deck - we'll do this by going thru 10 * number of cards times, and swap random pairs each iteration
    // Yeah, there are probably more elegant solutions but this should do the job
    for (var i = 0; i < game.rules.numberOfDecks * 520; i++)
    {
        var card1 = Math.floor(Math.random() * game.rules.numberOfDecks * 52);
        var card2 = Math.floor(Math.random() * game.rules.numberOfDecks * 52);
        var tempCard = game.deck.cards[card1];
        game.deck.cards[card1] = game.deck.cards[card2];
        game.deck.cards[card2] = tempCard;
    }

    // Clear out all hands
    game.activePlayer = "none";
    game.dealerHand.cards = [];
    game.playerHands = [];
}

function InitializeGame()
{
    var game = { deck:{cards:[]},
                 dealerHand:{cards:[]},
                 playerHands:[],
                 rules:{},
                 activePlayer:"none",
                 currentPlayerHand:0,
                 specialState:null,
                 bankroll:startingBankroll,
                 lastBet:startingBet,
                 possibleActions:[]
                };

    // Set default rules
    game.rules = {hitSoft17:false,    // Does dealer hit soft 17
             surrender:"late",        // Surrender offered - none, late, or early
             double:"any",            // Double rules - none, 10or11, 9or10or11, any
             doubleaftersplit:"any",  // Can double after split - none, 10or11, 9or10or11, any
             resplitAces:false,       // Can you resplit aces
             blackjackBonus:0.5,      // Bonus for player blackjack, usually 0.5 or 0.2
             numberOfDecks:1,         // Number of decks in play
             minBet:minBet,           // The minimum bet - not configurable
             maxBet:maxBet            // The maximum bet - not configurable
             };

    // Start by shuffling the deck
    ShuffleDeck(game);

    // Get the next possible actions
    SetNextActions(game);
    return game;
}

function AceInHand(cards)
{
    var hasAces = false;

    for (var i = 0; i < cards.length; i++)
    {
        if (cards[i].rank == 1)
        {
            hasAces = true;
            break;
        }
    }

    return hasAces;
}

function HandTotal(cards)
{
    var total = 0;

    for (var i = 0; i < cards.length; i++)
    {
        if (cards[i].rank > 10)
        {
            total += 10;
        }
        else
        {
            total += cards[i].rank;
        }
    }

    // If there are aces, add 10 to the total (unless it would go over 21)
    if ((total <= 11) && AceInHand(cards))
    {
        total += 10;
    }

    return total;
}

function SetNextActions(game)
{
    // Lots of special rules if you split Aces
    var splitAces = (game.activePlayer == "player") && ((game.playerHands.length > 1) && (game.playerHands[game.currentPlayerHand].cards[0].rank == 1));

    game.possibleActions = [];

    // Special situations if we just dealt
    if ((game.activePlayer == "player") && (game.playerHands.length == 1) && (game.playerHands[0].cards.length == 2))
    {
        // Insurance if the dealer has an ace showing, and they haven't already taken action on insurance
        if ((game.dealerHand.cards[1].rank == 1) && (game.specialState == null))
        {
            // To take insurance, they have to have enough in the bankroll
            if ((game.playerHands[0].bet / 2) <= game.bankroll)
            {
                game.possibleActions.push("insurance");
            }

            game.possibleActions.push("noinsurance");

            // Do we offer early surrender?
            if (game.rules.surrender == "early")
            {
                game.possibleActions.push("surrender");
            }
            return;
        }    

        // Surrender
        if (game.rules.surrender != "none")
        {
            game.possibleActions.push("surrender");
        }
    }

    // Other actions are only available for the first two cards of a hand
    if ((game.activePlayer == "player") && (game.playerHands[game.currentPlayerHand].cards.length == 2))
    {
        // Double down - not allowed if you split Aces
        if (!splitAces && (game.playerHands[game.currentPlayerHand].bet <= game.bankroll))
        {
            // Whether you can double is dictated by either the rules.double or rules.doubleaftersplit variable
            var doubleRules = (game.playerHands.length == 1) ? game.rules.double : game.rules.doubleaftersplit;
            var playerTotal = HandTotal(game.playerHands[game.currentPlayerHand].cards);
            switch (doubleRules)
            {
                case "any":
                    // You can double
                    game.possibleActions.push("double");
                    break;

                case "10or11":
                    if ((playerTotal == 10) || (playerTotal == 11))
                    {
                        game.possibleActions.push("double");
                    }
                    break;

                case "9or10or11":
                    if ((playerTotal >= 9) && (playerTotal <= 11))
                    {
                        game.possibleActions.push("double");
                    }
                    break;

                default:
                    break;
            }
        }

        // Split
        if (((game.playerHands[game.currentPlayerHand].cards[0].rank == game.playerHands[game.currentPlayerHand].cards[1].rank) 
            || ((game.playerHands[game.currentPlayerHand].cards[0].rank > 9) && (game.playerHands[game.currentPlayerHand].cards[1].rank > 9)))
          && (game.playerHands[game.currentPlayerHand].bet <= game.bankroll))
        {
            // OK, they can split if they haven't reached the maximum number of allowable hands
            if (game.playerHands.length < maxSplitHands)
            {
                // Oh - one more case; if they had Aces we have to check the resplit Aces rule
                if (!splitAces || game.rules.resplitAces)
                {
                    game.possibleActions.push("split");
                }
            }
        }
    }

    if (game.activePlayer == "player")
    {
        // We want hit/stand to be the first actions
        // If it's your turn, you can stand   
        game.possibleActions.unshift("stand");
        
        // You can hit as long as you don't have 21 
        if (HandTotal(game.playerHands[game.currentPlayerHand].cards) < 21)
        {
            // One more case - if you split Aces you only get one card (so you can't hit)
            if (!splitAces)
            {
                game.possibleActions.unshift("hit");
            }
        }
    }

    if (game.activePlayer == "none")
    {
        // At this point you can either bet (next hand) or shuffle if there
        // aren't enough cards.  If you are out of money (and can't cover the minimum bet), 
        // we make you first reset the bankroll
        if (game.bankroll < minBet)
        {
            game.possibleActions.push("resetbankroll");
        }
        else if (game.deck.cards.length > cardsBeforeShuffle)
        {
            game.possibleActions.push("bet");
        }
        else
        {
            game.possibleActions.push("shuffle");
        }
    }
}

function NextHand(game)
{
    // If it's none, it goes to player 0
    if (game.activePlayer == "none")
    {
        // It is the player's turn -- UNLESS the dealer has a blackjack with a 10 up
        // In that case, the hand is immediately over (goes to the dealer's turn)
        if ((HandTotal(game.dealerHand.cards) == 21) && (game.dealerHand.cards[1].rank != 1))
        {
            // OK, mark it as the dealer's turn to cause the card to flip and end the game
            game.activePlayer = "dealer";
        }    
        else
        {
            game.activePlayer = "player";  
            game.currentPlayerHand = 0; 
        }
    }  
    else if (game.activePlayer == "player")
    {
        if (game.currentPlayerHand < game.playerHands.length - 1)
        {
            // Still the player's turn - move to the next hand - note that we'll probably need to give them a second card
            game.currentPlayerHand++;
            if (game.playerHands[game.currentPlayerHand].cards.length < 2)
            {
                game.playerHands[game.currentPlayerHand].cards.push(game.deck.cards.shift());
            }
        }
        else
        {
            // Now it's the dealer's turn
            game.activePlayer = "dealer";
        }
    }
    else
    {
        // It was the dealer's turn - back to none
        game.activePlayer = "none";
    }

}
function PlayDealerHand(game)
{
    var takeCard;
    var total = HandTotal(game.dealerHand.cards);
    var allPlayerHandsBusted = true; // Assume everyone busted until proven otherwise
    var playerBlackjack = ((game.playerHands.length == 1) && (HandTotal(game.playerHands[0].cards) == 21) && (game.playerHands[0].cards.length == 2));

    // If all players have busted, we won't play thru
    for (var i = 0; i < game.playerHands.length; i++)
    {
        if (!game.playerHands[i].busted)
        {
            // Someone didn't bust
            allPlayerHandsBusted = false;
            break;
        }
    }

    // If all hands busted, or player has blackjack, or player surrendered we don't play
    if (!allPlayerHandsBusted && !playerBlackjack && (game.specialState != "surrender"))
    {
        while ((total < 17) || ((total == 17) && game.rules.hitSoft17 && AceInHand(game.dealerHand.cards)))
        {
            game.dealerHand.cards.push(game.deck.cards.shift());
            total = HandTotal(game.dealerHand.cards);
        }
    }

    // We're done with the dealer hand
    NextHand(game);
}

function DetermineWinner(game, playerHand)
{
    var dealerTotal = HandTotal(game.dealerHand.cards);
    var playerTotal = HandTotal(playerHand.cards);
    var dealerBlackjack = ((dealerTotal == 21) && (game.dealerHand.cards.length == 2));
    var playerBlackjack = ((game.playerHands.length == 1) && (playerTotal == 21) && (playerHand.cards.length == 2));

    // Did they surrender?  If so, that's that
    if (game.specialState == "surrender")
    {
        playerHand.outcome = "surrender";
    }
    // Did they take insurance?  If they did and the dealer has a blackjack, they win
    else 
    {
        if (game.specialState == "insurance")
        {
            // Note that insurance bets are off the initial bet (not the doubled amount)
            if (dealerBlackjack)    
            {
                // Well what do you know
                game.bankroll += (3 * playerHand.bet / 2);
            }
        }

        // Start with blackjack
        if (playerBlackjack)
        {
            playerHand.outcome = (dealerBlackjack) ? "push" : "blackjack";
        }
        else if (dealerBlackjack)
        {
            game.dealerHand.outcome = "dealerblackjack";
            playerHand.outcome = "loss";
        }
        // Now check for busts - player bust is automatic lose, dealer bust (if player didn't) is win
        else if (playerTotal > 21)
        {
            playerHand.outcome = "loss";
        }
        else
        {
            if (dealerTotal > 21)
            {
                playerHand.outcome = "win";
            }
            else if (playerTotal > dealerTotal)
            {
                playerHand.outcome = "win";
            }
            else if (playerTotal < dealerTotal)
            {
                playerHand.outcome = "loss";
            }
            else
            {
                playerHand.outcome = "push";
            }
        }
    }
    
    switch (playerHand.outcome)
    {
        case "blackjack":
            game.bankroll += (playerHand.bet * game.rules.blackjackBonus);
            // FALL THROUGH
        case "win":
            game.bankroll += (playerHand.bet * 2);
            break;
        case "push":
        case "surrender":
            game.bankroll += playerHand.bet;
            break;
        default:
            // I already took the money off the bankroll, you don't get any back
            break;
    }
}
