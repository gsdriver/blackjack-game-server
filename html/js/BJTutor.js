var app = angular.module("myApp", []);

app.controller('myCtrl', function ($scope, $http) {
    $http.get(config.serviceEndpoint)
    .then(function (response) {
        //$scope.gameState = { "activePlayer": "player", "currentPlayerHand": 0, "bankroll": 4150, "possibleActions": ["hit", "stand", "surrender", "double"], "dealerHand": { "outcome": "playing", "cards": [{ "rank": 0, "suit": "none" }, { "rank": 13, "suit": "hearts"}] }, "playerHands": [{ "bet": 100, "busted": false, "cards": [{ "rank": 3, "suit": "clubs" }, { "rank": 4, "suit": "diamonds"}], "outcome": "playing"}], "lastBet": "100", "houseRules": { "hitSoft17": false, "surrender": "late", "double": "any", "doubleaftersplit": true, "resplitAces": true, "blackjackBonus": "0", "numberOfDecks": 1, "minBet": 5, "maxBet": 1000} };
        $scope.gameState = response.data;
    }, function (response) {
        $scope.gameState = null;
    });

    $scope.SendAction = function (action) {
        var payload = "userID=" + $scope.gameState.userID;
        if (action == 'bet') {
            payload += "&value=" + $scope.gameState.lastBet;
        }

        $http.defaults.headers.post["Content-Type"] = "text/plain";

        $http.post(config.serviceEndpoint + action, payload)
        .then(function (response) {
            // The response is a new game state
            $scope.gameState = response.data;
        }, function (response) {
            $scope.myWelcome = "Problem sending action";
        });
    };

    $scope.ChangeRules = function () {
        var rulesBody = "minBet=" + $scope.gameState.houseRules.minBet + "&maxBet=" + $scope.gameState.houseRules.maxBet + "&hitSoft17=" + $scope.gameState.houseRules.hitSoft17;
        rulesBody += "&surrender=" + $scope.gameState.houseRules.surrender + "&double=" + $scope.gameState.houseRules.double + "&doubleaftersplit=" + $scope.gameState.houseRules.doubleaftersplit;
        rulesBody += "&resplitAces=" + $scope.gameState.houseRules.resplitAces + "&blackjackBonus=" + $scope.gameState.houseRules.blackjackBonus + "&numberOfDecks=" + $scope.gameState.houseRules.numberOfDecks;

        // And the userID
        rulesBody += ("&userID=" + $scope.gameState.userID);

        // First, hide the rules window
        $scope.showRules = false;

        // Now post these new rules to the server
        $http.defaults.headers.post["Content-Type"] = "text/plain";

        $http.post(config.serviceEndpoint + "setrules", rulesBody)
        .then(function (response) {
            // The response is a new game state
            $scope.gameState = response.data;
        }, function (response) {
            $scope.myWelcome = "Problem sending action";
        });
    };

    $scope.GetSuggestion = function () {
        $http.post(config.serviceEndpoint + "suggest", "userID=" + $scope.gameState.userID)
        .then(function (response) {
            // The response is a JSON object with a suggestion
            if (response.data.suggestion) {
                // Should probably do this in a localizable file
                var mapping = ["insurance", "You should take Insurance",
                               "noinsurance", "You shouldn't take Insurance",
                               "hit", "You should hit",
                               "stand", "You should stand",
                               "split", "You should split",
                               "double", "You should Double Down",
                               "surrender", "You should surrender!"];
                var index = mapping.indexOf(response.data.suggestion);

                if (index > -1) {
                    alert(mapping[index + 1]);
                }
            }
            else if (response.data.error) {
                alert("Error: " + response.data.error);
            }
        }, function (response) {
            alert("Problem getting suggestion from server");
        });
    };

    $scope.ShowRulesWindow = function () {
        return $scope.showRules;
    };

    $scope.ShowGameBoard = function () {
        return !$scope.showRules;
    };

    $scope.ShowSuggestButton = function () {
        return ($scope.gameState.activePlayer == 'player');
    };

    $scope.OnRulesClick = function () {
        $scope.showRules = true;
    };

    $scope.ShowChangeRules = function () {
        return ($scope.gameState.activePlayer == "none");
    };

    $scope.ShowBet = function () {
        return ($scope.gameState.playerHands.length) && ($scope.gameState.possibleActions.indexOf("bet") < 0);
    };

    $scope.PostURL = function (action) {
        return config.serviceEndpoint + action;
    };

    $scope.CardImage = function (card) {
        return "https://s3.amazonaws.com/blackjacktutor-card-images/" + card.rank + "_of_" + card.suit + ".png";
    };

    $scope.NextActionText = function (action) {
        // Should probably do this in a localizable file
        var mapping = ["resetbankroll", "Reset Bankroll",
                       "shuffle", "Shuffle Deck",
                       "bet", "Deal",
                       "insurance", "Take Insurance",
                       "noinsurance", "Don't take Insurance",
                       "hit", "Take a hit",
                       "stand", "Stand",
                       "split", "Split",
                       "double", "Double Down",
                       "surrender", "Surrender!"];
        var index = mapping.indexOf(action);

        return (index > -1) ? mapping[index + 1] : null;
    };

    $scope.HandTitle = function (hand, dealer, holeCardDown) {
        var htmlText = "";
        var handTotal;

        if (hand.cards && hand.cards.length) {
            htmlText += (dealer) ? "Dealer Cards" : "Your Cards";

            if (!holeCardDown) {
                // Also show the total
                var handTotal = 0;
                var hasAces = false;

                for (var i = 0; i < hand.cards.length; i++) {
                    if (hand.cards[i].rank > 10) {
                        handTotal += 10;
                    }
                    else {
                        handTotal += hand.cards[i].rank;
                    }
                    if (hand.cards[i].rank == 1) {
                        hasAces = true;
                    }
                }

                // If there are aces, add 10 to the total (unless it would go over 21)
                if ((handTotal <= 11) && hasAces) {
                    handTotal += 10;
                }
                htmlText += " - ";

                // If they busted, that will come in the HandOutcome function
                if (handTotal <= 21) {
                    htmlText += handTotal;
                }
            }
        }

        return htmlText;
    };

    $scope.HandOutcome = function (hand, dealer, holeCardDown) {
        var htmlText = "";
        // Should probably do this in a localizable file
        var outcomeMapping = ["blackjack", "You win with a Natural Blackjack!",
                               "dealerblackjack", "The dealer has Blackjack",
                               "nodealerblackjack", "The dealer doesn't have Blackjack",
                               "win", "You won!",
                               "loss", "You lost",
                               "push", "It's a tie",
                               "surrender", "You surrendered"];
        var index = outcomeMapping.indexOf(hand.outcome);
        var outcome = (index > -1) ? outcomeMapping[index + 1] : null;

        if (hand.cards && hand.cards.length) {
            if (!holeCardDown) {
                // Check if they busted
                var handTotal = 0;

                for (var i = 0; i < hand.cards.length; i++) {
                    if (hand.cards[i].rank > 10) {
                        handTotal += 10;
                    }
                    else {
                        handTotal += hand.cards[i].rank;
                    }
                }

                if (handTotal > 21) {
                    htmlText += "BUST";
                }
            }

            // If there's an outcome, show it
            if (outcome) {
                htmlText += " " + outcome;
            }
        }

        return htmlText;
    };

    $scope.RulesSummary = function (rules) {
        var text = "";

        // Start with bet information
        text += "Bet: $" + rules.minBet + " - " + rules.maxBet + ". ";

        // Hit or stand on soft 17
        text += "Dealer " + (rules.hitSoft17 ? "hits" : "stands") + " on soft 17. ";

        // Double rules
        var doubleMapping = ["any", "any cards",
                              "10or11", "10 or 11 only",
                              "9or10o11", "9-11 only",
                              "none", "not allowed"];
        var iDouble = doubleMapping.indexOf(rules.double);
        if (iDouble > -1) {
            text += "Double on " + doubleMapping[iDouble + 1] + ". ";
            text += "Double after split " + (rules.doubleaftersplit ? "allowed. " : "not allowed. ");
        }

        // Splitting (only metion if you can resplit aces 'cuz that's uncommon)
        if (rules.resplitAces) {
            text += "Can resplit Aces. ";
        }

        // Surrender rules
        var surrenderMapping = ["none", "Surrender not offered. ",
                              "early", "Early surrender allowed. ",
                              "late", "Late surrender allowed. "];
        var iSurrender = surrenderMapping.indexOf(rules.surrender);
        if (iSurrender > -1) {
            text += surrenderMapping[iSurrender + 1];
        }

        // Blackjack payout
        var blackjackPayout = ["0.5", "3 to 2",
                               "0.2", "6 to 5",
                               "0", "even money"];
        var iBlackjack = blackjackPayout.indexOf(rules.blackjackBonus.toString());
        if (iBlackjack > -1) {
            text += "Blackjack pays " + blackjackPayout[iBlackjack + 1];
        }

        return text;
    };
});

