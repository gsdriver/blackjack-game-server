//
// This is the Suggestion module (suggested next action)
//

var utils = require('./utils');

/*
 * Exported functions
 */

module.exports = {
    // Recommended actions follow Basic Strategy, based on the rules currently in play
    GetRecommendedPlayerAction: function(game)
    {
        // If it's not your turn, we have no recommendation
        if (game.activePlayer != "player")
        {
            return "none";
        }

        // OK, let's look at the player total, cards, and the dealer up card
        var playerHand = game.playerHands[game.currentPlayerHand];
        var dealerCard = (game.dealerHand.cards[1].rank > 10) ? 10 : game.dealerHand.cards[1].rank;

        // If early surrender is allowed, check that now (that's what early surrender means - before dealer checks for blackjack
        if ((game.rules.surrender == "early") && (ShouldPlayerSurrender(game, playerHand, dealerCard)))
        {
            return "surrender";
        }

        // OK, if an ace is showing it's easy - never take insurance
        if (game.possibleActions.indexOf("insurance") > -1)
        {
            return "noinsurance";    
        }

        // Check each situation
        if (ShouldPlayerSplit(game, playerHand, dealerCard))
        {
            return "split";
        }
        else if (ShouldPlayerDouble(game, playerHand, dealerCard))
        {
            return "double";
        }
        // Note if early surrender is allowed we already checked, so no need to check again
        else if ((game.rules.surrender != "early") && ShouldPlayerSurrender(game, playerHand, dealerCard))
        {
            return "surrender";
        }
        else if (ShouldPlayerStand(game, playerHand, dealerCard))
        {
            return "stand";
        }
        else if (ShouldPlayerHit(game, playerHand, dealerCard))
        {
            return "hit";
        }

        // I got nothing
        return "none";
    }
}; 

/*
 * Internal functions
 */

function ShouldPlayerSplit(game, playerHand, dealerCard)
{
    var shouldSplit = false;

    // It needs to be a possible action
    if (game.possibleActions.indexOf("split") > -1)
    {
        switch (playerHand.cards[0].rank)
        {
            case 1:
                // Always split aces
                shouldSplit = true;
                break;
            case 2:
            case 3:
                // Against 4-7, or 2 and 3 if you can double after split
                shouldSplit = ((dealerCard > 3) && (dealerCard < 8)) || (((dealerCard == 2) || (dealerCard == 3)) && (game.rules.doubleaftersplit));
                break;
            case 4:
                // Against 5 or 6, and only if you can double after split
                shouldSplit = ((dealerCard == 5) || (dealerCard == 6)) && (game.rules.doubleaftersplit);
                break;
            case 6:
                // Split 3-6, or against a 2 if double after split is allowed
                shouldSplit = ((dealerCard > 2) && (dealerCard < 7)) || ((dealerCard == 2) && (game.rules.doubleaftersplit));
                break;
            case 7:
                // Split on 2-7
                shouldSplit = ((dealerCard > 1) && (dealerCard < 8));
                break;
            case 8:
                // Always split 8s UNLESS the dealer has an ace and hits soft 17 and you can't surrender (who knew)
                shouldSplit = !((dealerCard == 1) && (game.rules.hitSoft17) && (game.rules.surrender == "none"));
                break;
            case 9:
                // Split against 2-9 except 7
                shouldSplit = ((dealerCard > 1) && (dealerCard < 10) && (dealerCard != 7));
                break;
            case 5:
            case 10:
            case 11:
            case 12:
            case 13:
            default:
                // Don't split 5s or 10s ... or cards I don't know
                break;
        }
    }

    return shouldSplit;
}

function ShouldPlayerDouble(game, playerHand, dealerCard)
{
    var shouldDouble = false;

    // It needs to be a possible action
    if (game.possibleActions.indexOf("double") > -1)
    {
        // Need to know the hand total and whether it's soft
        var handValue = utils.HandTotal(playerHand.cards);

        if (handValue.soft)
        {
            // Let's look at the non-ace card to determine what to do (get this by the total)
            switch (handValue.total)
            {
                case 13:
                case 14:
                    // Double against dealer 5 or 6
                    shouldDouble = (dealerCard == 5) || (dealerCard == 6);
                    break;
                case 15:
                case 16:
                    // Double against dealer 4-6
                    shouldDouble = (dealerCard >= 4) && (dealerCard <= 6);
                    break;
                case 17:
                    // Double against 3-6
                    shouldDouble = (dealerCard >= 3) && (dealerCard <= 6);
                    break;
                case 18:
                    // Double against 3-6 - also 2 if the dealer hits soft 17
                    shouldDouble = (dealerCard >= 3 && (dealerCard <= 6)) || ((dealerCard == 2) && game.rules.hitSoft17);
                    break;
                case 19:
                    // Double against 6 if the dealer hits soft 17
                    shouldDouble = (dealerCard == 6) && game.rules.hitSoft17;
                    break;
                default:
                    // Don't double
                    break;
            }
        }
        else
        {
            // Double on 9, 10, or 11 only
            switch (handValue.total)
            {
                case 9:
                    // Double 3-6
                    shouldDouble = (dealerCard >= 3) && (dealerCard <= 6);
                    break;
                case 10:
                    // Double 2-9
                    shouldDouble = (dealerCard >= 2) && (dealerCard <= 9);
                    break;
                case 11:
                    // Double anything except an ace (and then only if the dealer doesn't hit soft 17)
                    shouldDouble = !((dealerCard == 1) && !game.rules.hitSoft17);
                    break;
                default:
                    break;
            }
        }
    }

    return shouldDouble;
}

function ShouldPlayerSurrender(game, playerHand, dealerCard)
{
    var shouldSurrender = false;

    // It needs to be a possible action
    if (game.possibleActions.indexOf("surrender") > -1)
    {
        var handValue = utils.HandTotal(playerHand.cards);

        // BUGBUG - add early surrender rules too: http://wizardofodds.com/games/blackjack/appendix/6/
        if (game.rules.hitSoft17)
        {
            // Don't surrender a soft hand
            if (!handValue.soft)
            {
                switch (handValue.total)
                {
                    case 15:
                        // Surrender against 10 or Ace
                        shouldSurrender = (dealerCard == 10) || (dealerCard == 1);
                    case 16:
                        // Surrender against 9-Ace unless it's a pair of 8s in which case only against ace
                        if (dealerCard == 1)
                        {
                            shouldSurrender = true;
                        }
                        else
                        {
                            shouldSurrender = (playerHand.cards[0].rank != 8) && ((dealerCard == 9) || (dealerCard == 10));
                        }
                        break;
                    case 17:
                        // Surrender against ace
                        shouldSurrender = (dealerCard == 1);
                        break;
                    default:
                        // Don't surender
                        break;
                }
            }
        }
        else
        {
            // We're less likely to surrender - 15 against 10, 16 (non-8s) against 9-Ace
            if (handValue.total == 15)
            {
                shouldSurrender == (dealerCard == 10);
            }
            else if (handValue.total == 16)
            {
                shouldSurrender = (playerHand.cards[0].rank != 8) && ((dealerCard == 9) || (dealerCard == 10) || (dealerCard == 1));
            }
        }
    }

    return shouldSurrender;    
}

function ShouldPlayerStand(game, playerHand, dealerCard)
{
    var shouldStand = false;

    // It needs to be a possible action (also note this is last action so we already told them not to double/surrender/etc)
    if (game.possibleActions.indexOf("stand") > -1)
    {
        var handValue = utils.HandTotal(playerHand.cards);

        if (handValue.soft)
        {
            // Don't stand until you hit 18
            if (handValue.total > 18)
            {
                shouldStand = true;
            }
            else if (handValue.total == 18)
            {
                // Stand against dealer 2-8
                shouldStand = (handValue.total >= 2) && (handValue.total <= 8);
            }
        }
        else
        {
            // Stand on 17 or above
            if (handValue.total > 16)
            {
                shouldStand = true;
            }
            else if (handValue.total > 12)
            {
                // 13-16 you should stand against dealer 2-6
                shouldStand = (dealerCard >= 2) && (dealerCard <= 6);
            }
            else if (handValue.total == 12)
            {
                // Stand on dealer 4-6
                shouldStand = (dealerCard >= 4) && (dealerCard <= 6);
            }
        }
    }

    return shouldStand;    
}

function ShouldPlayerHit(game, playerHand, dealerCard)
{
    var shouldHit = false;

    // It needs to be a possible action (also note this is last action so we already told them not to double/split/etc)
    if (game.possibleActions.indexOf("hit") > -1)
    {
        // Well geez, I tested everything else so you should hit
        shouldHit = true;
    }

    return shouldHit;    
}
