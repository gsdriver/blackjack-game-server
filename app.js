//
// This is the Render Service main application
//

// HTTP connection
const http = require('http');
var port = process.env.PORT || 3000;
var host = process.env.HOST || 'localhost';

// Helper classes (which will eventually become separate services)
var gameService = require('./GameService');

// Create the server
const server = http.createServer((req, res) => {  
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', "GET, PUT, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

  // We only support GET
  if (req.method == 'GET')
  {
      // Start by reading cookies to see if they have a GUID set (and we can play with state that way)
      var action = req.url && req.url.substring(1);
      var cookies = parseCookies(req);
      var userID;

      // Allow them to send flushcache in the URL to clear state
      // Do we have a cookie? If not, generate a new one and set it
      if ((action != "flushcache") && cookies && cookies["BJTutorSession"])
      {
          userID = cookies["BJTutorSession"];
      }
      else
      {
          userID = Math.floor(Math.random() * 100000000); // A guid would be better, but let's just go with 100 mil
          res.setHeader('Set-Cookie', 'BJTutorSession=' + userID);
      }

        // We are going to call the Game service to get a JSON representation of the game
        gameService.GetGameState(userID, function(gameState)
        {
            // Now translate this into an HTML response
            var response = TranslateGameToHTML(gameState);
      
            // OK, set the response
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
            res.end(response);
        });
  }
  else if (req.method == 'POST')
  {
      // POST can only be used if we have an assoicated cookie
      var action = req.url && req.url.substring(1);
      var cookies = parseCookies(req);
      var userID;
      var fullbody = "";

      // For a post, we need to read the form data (in case they have bet information)
      req.on('data', function(chunk) {
            // append the current chunk of data to the fullBody variable
            fullbody += chunk.toString();
        });

      req.on('end', function() {
          // request ended -> let's see if there's a value in there
          try
          {
              // If this is a rules push, then we should send in a new rules object
              var value = null;

              if (action == "setrules")
              {
                  // value will be a rules object
                  value = TextToRules(fullbody);
              }
              else
              {
                  // Pull the value out (if it exists)
                  var key = fullbody.split("=");
              
                  for (var i = 0; i < key.length - 1; i++)
                  {
                      if (key[i] == "value")
                      {
                          // Next one is it
                          value = key[i + 1];
                          break;
                      }
                  }
              }

              // Do we have a cookie? If not, generate a new one and set it
              if (cookies && cookies["BJTutorSession"])
              {
                  userID = cookies["BJTutorSession"];

                  // OK, next action
                  gameService.UserAction(userID, action, value, function(gameState)
                  {
                      //  If there was an error, try to clear the cookie
                      if (gameState)
                      {
                          // Now translate this into an HTML response
                          var response = TranslateGameToHTML(gameState);
      
                          // OK, set the response
                          res.statusCode = 200;
                          res.setHeader('Content-Type', 'text/html');
                          res.end(response);
                      }
                      else
                      {
                          // We need to clear the cookie
                          res.setHeader('Set-Cookie', 'BJTutorSession=');
                      }
                  });
              }
              else
              {
                  // Sorry, we can't do this
                  res.writeHead(400, "Bad Request", {'Content-Type': 'text/html'});
                  res.write('No User Cookie found');
                  res.end('\n');
              }
          }
          catch(err)
          {
              // Oops - couldn't read the body
              res.writeHead(400, "Bad Request", {'Content-Type': 'text/html'});
              res.write(err);
              res.end('\n');
          }
      });
  }
  else
  {
      // We only support GET right now
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/plain');
      res.write('Only GET is supported now');
      res.end('\n');
  }
});


server.listen(port, host, () => {
  console.log('Server listening on port ' + host + ':' + port);
});

function parseCookies(request) 
{
    var list = {};
    var rc = request.headers.cookie;

    rc && rc.split(';').forEach(function( cookie ) {
        var parts = cookie.split('=');
        list[parts.shift().trim()] = decodeURI(parts.join('='));
    });

    return list;
}

function TranslateGameToHTML(gameState)
{
    // Show the dealer's hand, then show the player's hand, then show the action buttons
    // Yes, pretty boring but we are just getting started
    var htmlText = "";
    var handTotal;
    var error = GameError(gameState);
    
    htmlText += "<HTML><style>input[type=\'submit\']{font-size:36px;padding:10px;}</style>\r\n<style>input[type=\'number\']{font-size:36px;width:150px;}</style>\r\n";
    htmlText += "<style>button.link { background:none;border:none; }</style>\r\n";
    htmlText += "<TABLE style=\"width:100%\">\r\n";
    htmlText += "<TR><TD colspan=\"2\" align=\"center\">";

    // You can only change rules when the turn is over
    if (gameState.activePlayer == "none")
    {
        htmlText += "<button id = \"gamerules\" class=\"link\"><h2>" + RulesSummary(gameState.houseRules) + "</h2></button>"
    }
    else
    {
        htmlText += "<h2>" + RulesSummary(gameState.houseRules) + "</h2>";
    }
    htmlText += "</TD></TR>\r\n<TR><TD>";

    // Hands 
    htmlText += HandToHTML(gameState.dealerHand.cards, true, (gameState.activePlayer == "player"), HandOutcome(gameState.dealerHand));
    htmlText += "<P><P>";
    for (var i = 0; i < gameState.playerHands.length; i++)
    {
        htmlText += HandToHTML(gameState.playerHands[i].cards, false, false, HandOutcome(gameState.playerHands[i]));
    }
    htmlText += "</TD>";

    // Now draw buttons for each available action, as well as bet and bankroll
    htmlText += "<TD width=300px valign=top>";
    if (error)
    {
        // Some kind of error state - let the player know
        htmlText += "<H2>" + error + "</H2>";
    }
    htmlText += "<H2>Bankroll: $" + gameState.bankroll + "</H2>";
    if (gameState.playerHands.length && (gameState.possibleActions.indexOf("bet") < 0))
    {
        // TODO: Show the bet per hand (double could change it)
        htmlText += "<H2>Bet: $" + gameState.playerHands[0].bet + "</H2>";
    }
    for (j = 0; j < gameState.possibleActions.length;j++)
    {
        // Bet is a special case - the rest are all just buttons
        htmlText += "<form method=\"post\" action=\"" + gameState.possibleActions[j]  + "\">";
        if (gameState.possibleActions[j] == "bet")
        {
            htmlText += "<H2>Place your bet:</H2><input type =\"number\" value=\"" + gameState.lastBet + "\" name=\"value\">&nbsp;&nbsp;&nbsp;";
        }
        htmlText += "<input type =\"submit\" value=\"" + NextActionText(gameState.possibleActions[j]) + "\">";
        htmlText += "</form><BR><BR>\r\n"
    }
    htmlText += "</TD></TR></TABLE>";

    // Finally, some JavaScript in case they click the rules to change them
    htmlText += "\r\n<script>var button = document.getElementById(\"gamerules\");\r\n";
    htmlText += "button.onclick = function(){ document.write(\'" + GetRulesHTML(gameState) + "\'); }\r\n";
    //htmlText += "button.onclick = function(){ var myWindow = window.open(\"\", \"Rules\"); myWindow.document.write(\'" + GetRulesHTML(gameState) + "\'); }\r\n";
    htmlText += "</script>";

    return htmlText;
}

function HandToHTML(cards, dealer, holeCardDown, outcome)
{
    var htmlText = "";
    var handTotal;

    if (cards && cards.length)
    {
        htmlText += (dealer) ? "<H1>Dealer Cards" : "<H1>Your Cards";
        if (!holeCardDown)
        {
            // Also show the total
            htmlText += " - ";
            handTotal = GetHandTotal(cards);
            htmlText += (handTotal > 21) ? "<FONT COLOR=RED>BUST</FONT>" : handTotal;
        }

        // If there's an outcome, show it
        if (outcome)
        {
            htmlText += "<FONT COLOR=RED> " + outcome + "</FONT>";
        }
        htmlText += "</H1><P><P>";

        for (var i = 0; i < cards.length; i++)
        {
            htmlText += "<IMG SRC=\"" + ImageFromCard(cards[i]);
            htmlText += "\" width=\"200\" height=\"auto\" \">\r\n";
        }
    }

    return htmlText;
}

function ImageFromCard(card)
{
    return ("https://s3.amazonaws.com/blackjacktutor-card-images/" + card.rank + "_of_" + card.suit + ".png");
}

function NextActionText(action)
{
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
}

function HandOutcome(playerHand)
{
    // Should probably do this in a localizable file
    var outcomeMapping = [ "blackjack", "You win with a Natural Blackjack!",
                           "dealerblackjack", "The dealer has Blackjack",
                           "nodealerblackjack", "The dealer doesn't have Blackjack",
                           "win", "You won!",
                           "loss", "You lost",
                           "push", "It's a tie",
                           "surrender", "You surrendered"];

    var index = outcomeMapping.indexOf(playerHand.outcome);
    return (index > -1) ? outcomeMapping[index + 1] : null;
}

function GameError(gameState)
{
    // Should probably do this in a localizable file too
    var errorMapping = [   "invalidaction", "Unrecognized action",
                           "bettoosmall", "Bet must be at least $" + gameState.houseRules.minBet,
                           "bettoolarge", "Bet cannot exceed $" + gameState.houseRules.maxBet,
                           "betoverbankroll", "Bet cannot exceed your bankroll"];

    var index = errorMapping.indexOf(gameState.error);
    return (index > -1) ? errorMapping[index + 1] : null;
}

function HasAces(cards)
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

function GetHandTotal(cards)
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
    if ((total <= 11) && HasAces(cards))
    {
        total += 10;
    }

    return total;
}

//
// Dealing with rules
//

function GetRulesHTML(gameState)
{
    var htmlText = "";

    htmlText = "<form action=\"setrules\" method=\"post\">";
    
    // Start with the simpler actions (on or off)
    htmlText += "<fieldset><legend>Playing options</legend>";

    // Double after split
    htmlText += "<input type =\"checkbox\" name=\"doubleaftersplit\"";
    if (gameState.houseRules.doubleaftersplit != "none")
    {
        htmlText += " checked";
    }
    htmlText += "> Double after split";
    
    // Resplit aces
    htmlText += "<input type =\"checkbox\" name=\"resplitAces\"";
    if (gameState.houseRules.resplitAces)
    {
        htmlText += " checked";
    }
    htmlText += "> Allow resplit aces";
     
    // Hit soft 17
    htmlText += "<input type =\"checkbox\" name=\"hitSoft17\"";
    if (gameState.houseRules.hitSoft17)
    {
        htmlText += " checked";
    }
    htmlText += "> Dealer hits soft 17";
    htmlText += "</fieldset><BR>";

    // Number of decks in play
    htmlText += "<fieldset><legend>Number of Decks</legend>";
    htmlText += AddRadioButton(gameState, "numberOfDecks", "1", "1");
    htmlText += AddRadioButton(gameState, "numberOfDecks", "2", "2");
    htmlText += AddRadioButton(gameState, "numberOfDecks", "4", "4");
    htmlText += AddRadioButton(gameState, "numberOfDecks", "6", "6");
    htmlText += AddRadioButton(gameState, "numberOfDecks", "8", "8");
    htmlText += "</fieldset><BR>";
            
    // Double down options
    htmlText += "<fieldset><legend>Double Down</legend>";
    htmlText += AddRadioButton(gameState, "double", "any", "Any two cards");
    htmlText += AddRadioButton(gameState, "double", "10or11", "10 or 11 only");
    htmlText += AddRadioButton(gameState, "double", "9or10or11", "9, 10, or 11 only");
    htmlText += AddRadioButton(gameState, "double", "none", "Not offered");
    htmlText += "</fieldset><BR>";

    // Blackjack payout options
    htmlText += "<fieldset><legend>Blackjack Bonus</legend>";
    htmlText += AddRadioButton(gameState, "blackjackBonus", "0.5", "3 to 2");
    htmlText += AddRadioButton(gameState, "blackjackBonus", "0.2", "6 to 5");
    htmlText += AddRadioButton(gameState, "blackjackBonus", "0", "Even money");
    htmlText += "</fieldset><BR>";

    // Surrender options
    htmlText += "<fieldset><legend>Surrender options</legend>";
    htmlText += AddRadioButton(gameState, "surrender", "none", "Not allowed");
    htmlText += AddRadioButton(gameState, "surrender", "late", "Late (after dealer checks for blackjack)");
    htmlText += AddRadioButton(gameState, "surrender", "early", "Early (before dealer checks for blackjack)");
    htmlText += "</fieldset><BR>";

    // Submit button
    // Probably want a close button too
    htmlText += "<input type=\"submit\" value=\"Change Rules\">";
    htmlText += "</form>";

    // Add some script to close myself
    //htmlText += "<script type=\"text/javascript\"> function closeSelf (f) {f.submit(); window.close(); }</scr";
    return htmlText;
}

function AddRadioButton(gameState, fieldName, fieldValue, ruleText)
{
    var htmlText = "";

    htmlText += "<input type=\"radio\" name=\"" + fieldName + "\" value=\"" + fieldValue + "\"";
    if (gameState.houseRules[fieldName] == fieldValue)
    {
        htmlText += " checked";
    }
    htmlText += "> " + ruleText;
   
    return htmlText;
}

function RulesSummary(rules)
{
    var text = "";

    // Start with bet information
    text += "Bet: $" + rules.minBet + " - " + rules.maxBet + ". ";

    // Hit or stand on soft 17
    text += "Dealer " + (rules.hitSoft17 ? "hits" : "stands") + " on soft 17. ";

    // Double rules
    var doubleMapping = [ "any", "any cards",
                          "10or11", "10 or 11 only",
                          "9or10o11", "9-11 only",
                          "none", "not allowed"];
    var iDouble = doubleMapping.indexOf(rules.double);
    if (iDouble > -1)
    {
        text += "Double on " + doubleMapping[iDouble + 1] + ". ";
        text += "Double after split " + ((rules.doubleaftersplit == "none") ? "allowed. " : "not allowed. ");
    }

    // Splitting (only metion if you can resplit aces 'cuz that's uncommon)
    if (rules.resplitAces)
    {
        text += "Can resplit Aces. ";
    }

    // Surrender rules
    var surrenderMapping = [ "none", "Surrender not offered. ",
                          "early", "Early surrender allowed. ",
                          "late", "Late surrender allowed. "];
    var iSurrender = surrenderMapping.indexOf(rules.surrender);
    if (iSurrender > -1)
    {
        text += surrenderMapping[iSurrender + 1];
    }

    // Blackjack payout
    var blackjackPayout = ["0.5", "3 to 2", 
                           "0.2", "6 to 5",
                           "0", "even money"];
    var iBlackjack = blackjackPayout.indexOf(rules.blackjackBonus.toString());
    if (iBlackjack > -1)
    {
        text += "Blackjack pays " + blackjackPayout[iBlackjack + 1];
    }

    return text;
}

function TextToRules(ruleText)
{
    var rules = {hitSoft17:false, surrender:"late", double:"any", doubleaftersplit:"any", 
             resplitAces:false, blackjackBonus:0.5, numberOfDecks:1, minBet:0, maxBet:0 };
    var params = ruleText.split("&");
    var doubleAfterSplit = false;

    for (var i = 0; i < params.length; i++)
    {
        var valuePair = params[i].split("=");

        if (valuePair && (valuePair.length == 2))
        {
            switch (valuePair[0])
            {
                case "hitSoft17":
                    rules.hitSoft17 = (valuePair[1] == "on");
                    break;

                case "surrender":
                    rules.surrender = valuePair[1];
                    break;

                case "double":
                    rules.double = valuePair[1];
                    break;

                case "doubleaftersplit":
                    // Make a note if set - we will set to the double rule after we've processed (don't allow for deviation)
                    doubleAfterSplit = (valuePair[1] == "on");
                    break;

                case "resplitAces":
                    rules.resplitAces = (valuePair[1] == "on");
                    break;

                case "blackjackBonus":
                    rules.blackjackBonus = valuePair[1];
                    break;

                case "numberOfDecks":
                    rules.numberOfDecks = Number(valuePair[1]);
                    break;

                default:
                    break;
            }
        }
    }

    // Set the double after split rules
    rules.doubleaftersplit = (doubleAfterSplit) ? rules.double : "none";
    
    return rules;
}