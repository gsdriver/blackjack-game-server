//
// This is the module for handling rules
//

// Redis cache
var config = require('./config');
var utils = require('./utils');

// These will go into a rule file at some point
var defaultRules = {version:"1.0.0",  // Version information
             name:"default",          // Name for this set of rules
             key:null,                // Key for this set of rules in the cache (null if not cached)
             hitSoft17:false,         // Does dealer hit soft 17
             surrender:"late",        // Surrender offered - none, late, or early
             double:"any",            // Double rules - none, 10or11, 9or10or11, any
             doubleaftersplit:true,   // Can double after split - none, 10or11, 9or10or11, any
             resplitAces:false,       // Can you resplit aces
             blackjackBonus:0.5,      // Bonus for player blackjack, usually 0.5 or 0.2
             numberOfDecks:1,         // Number of decks in play
             minBet:5,                // The minimum bet - not configurable
             maxBet:1000,             // The maximum bet - not configurable
             maxSplitHands:4          // Maximum number of hands you can have due to splits
             };

// Other configurations
const maxSplitHands = 4;
const minBet = 5;
const maxBet = 1000;
const keyPrefix = "rules:";
/*
 * Exported functions
 */

module.exports = {
    GetRules : function(guid, callback) {
        // Add "rules:" to this ID to create the redis key
        utils.ReadFromCache(keyPrefix + guid, function(error, result)
        {
            // If we don't have a result, just pass back the error
            if (!result)
            {
                callback(error, null);
            }
            else
            {
                // OK, we have a set of rules - let's copy them over
                callback(null, ConvertResultToRules(result));
            }
        });
    },
    GetSavedRules : function(callback) {
        // This function reads in all the rules which have been saved in the cache
        // This allows the user to pick from a set of rules based on friendly name
        utils.ReadAllKeys(keyPrefix, function(error, keys)
        {
            // I guess this is small enough that we can return the full structure
            // Alternate would be to just pass back the name and key, and require the
            // client to call GetRules after they've selected one they want
            var rulesToReturn = [];
            var rules;

            if (error) {
                callback(error, null);
            }
            else {
                for (var i = 0; i < keys.length; i++) {
                    rules = ConvertResultToRules(result);
                    if (rules)
                    {
                        // We'll just ignore ones that we can't convert
                        // We could throw an error too (that some/all rules are corrupt)
                        rulesToReturn.push(rules);
                    }
                }

                callback(null, rulesToReturn);
            }
        });
    },
    SaveRules : function(rules) {
        // Write these rules into the cache - be sure to add the current version when we write
        var rulesWithVersion = rules;

        rulesWithVersion.version = "1.0.0";
        utils.WriteToCache(keyPrefix + rules.key, rulesWithVersion);
    },
    GetDefaultRules : function() {
        return ConvertResultToRules(defaultRules);
    },
    Validate : function(rules) {
        // BUBGUB -- There has got to be a better way to copy and validate this user input
        var newRules = rules;

        // Min and max bet aren't changed by user input, nor is max split hands
        newRules.minBet = minBet;
        newRules.maxBet = maxBet;
        newRules.maxSplitHands = maxSplitHands;

        return newRules;
    }
}; 

/*
 * Internal functions
 */

function ConvertResultToRules(result)
{
    var ruleResult = {};

    // OK, let's parse 
    if (result)
    {
        // result can either be a string or an Object
        rules = (typeof result == "string") ? JSON.parse(result) : ((typeof result == "object") ? result : null);

        // Will add versioning checks later - for now just make sure the version is there and set to 1
        // If it's not, we will return null and force a new game to be initialized
        if (rules && rules.version && (rules.version == "1.0.0"))
        {
            // OK, copy over value - could also do checks to make sure each field is valid
            ruleResult.name = rules.name;
            ruleResult.hitSoft17 = rules.hitSoft17;
            ruleResult.surrender = rules.surrender;
            ruleResult.double = rules.double;
            ruleResult.doubleaftersplit = rules.doubleaftersplit;
            ruleResult.resplitAces = rules.resplitAces;
            ruleResult.blackjackBonus = rules.blackjackBonus;
            ruleResult.numberOfDecks = rules.numberOfDecks;
            ruleResult.minBet = rules.minBet;
            ruleResult.maxBet = rules.maxBet;
            ruleResult.maxSplitHands = rules.maxSplitHands;

            return ruleResult;
        }
    }
    
    // Sorry, no rules for you
    return null;
}
