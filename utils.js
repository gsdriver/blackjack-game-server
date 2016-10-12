//
// Utility functionals
//

/*
 * Exported functions
 */

module.exports = {
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

