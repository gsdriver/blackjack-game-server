//
// Utility functionals
//

var redis = require('redis');
var uuid = require('node-uuid');
var config = require('./config');
var gameCache = redis.createClient({host: config.redisHost});

gameCache.on('connect', function() {
    console.log('Redis connected');
});

/*
 * Exported functions
 */

module.exports = {
    // Cache functions
    ReadFromCache: function (key, callback) {
        gameCache.get(key, function (error, result) {
            callback(error, result);
        });
    },
    WriteToCache: function (key, value) {
        gameCache.set(key, value);
    },
    ExpireFromCache: function (key, timeout) {
        gameCache.expire(key, timeout);
    },
    ReadAllKeys: function (prefix, callback) {
        gameCache.keys(prefix, function (error, keys) {
            if (error) {
                callback(error, null);
            }
            else {
                callback(null, keys);
            }
        });
    },
    // GUID generation
    GenerateGUID: function () {
        return uuid.v4();
    },
    // Recommended actions follow Basic Strategy, based on the rules currently in play
    HandTotal: function (cards) {
        var retval = { total: 0, soft: false };
        var hasAces = false;

        for (var i = 0; i < cards.length; i++) {
            if (cards[i].rank > 10) {
                retval.total += 10;
            }
            else {
                retval.total += cards[i].rank;
            }

            // Note if there's an ace
            if (cards[i].rank == 1) {
                hasAces = true;
            }
        }

        // If there are aces, add 10 to the total (unless it would go over 21)
        // Note that in this case the hand is soft
        if ((retval.total <= 11) && hasAces) {
            retval.total += 10;
            retval.soft = true;
        }

        return retval;
    }
};

