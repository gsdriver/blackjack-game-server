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
      // Let's see if they passed in a user ID
      var fullbody = "";

      req.on('data', function(chunk) {
            // append the current chunk of data to the fullBody variable
            fullbody += chunk.toString();
        });

      req.on('end', function() {
          // Start by reading cookies to see if they have a GUID set (and we can play with state that way)
          var action = req.url && req.url.substring(1);
          var userID = ParseUserID(req, fullbody);

          // Allow them to send flushcache in the URL to clear state
          // Do we have a user ID? If not, generate a new one and set it
          if ((action == "flushcache") || !userID)
          {
              userID = Math.floor(Math.random() * 100000000); // A guid would be better, but let's just go with 100 mil
              res.setHeader('Set-Cookie', 'BJTutorSession=' + userID);
          }

            // We are going to call the Game service to get a JSON representation of the game
            gameService.GetGameState(userID, function(error, gameState)
            {
                // Pass back the error or the game state
                if (error)
                {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({error: error}))
                }
                else
                {
                    // OK, set the response
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(gameState));
                }
            });
        });
  }
  else if (req.method == 'POST')
  {
      // POST can only be used if we have an assoicated cookie
      var action = req.url && req.url.substring(1);
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
              var userID = ParseUserID(req, fullbody);

              if (action == "suggest")
              {
                  // Different function call - not an action but a request for a suggestion
                  gameService.GetRecommendedAction(userID, function(error, action)
                  {
                      // Write to the console
                      var recommendation = {error: error, suggestion: action};

                      res.statusCode = 200;
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify(recommendation));
                  });
              }
              else 
              {    
                  if (action == "setrules")
                  {
                      // value will be a rules object
                      value = TextToRules(fullbody);
                  }
                  else
                  {
                      // Pull the value out (if it exists)
                      value = GetKeyValue(fullbody, "value");
                  }

                  // Do we have a cookie? If not, generate a new one and set it
                  if (userID)
                  {
                      // OK, next action
                      gameService.UserAction(userID, action, value, function(error, gameState)
                      {
                          // If you get "invalid id" error, then clear the cookie
                          if (error == "Invalid ID")
                          {
                              res.setHeader('Set-Cookie', 'BJTutorSession=');
                          }
                          else
                          {
                              if (error)
                              {
                                  res.statusCode = 400;
                                  res.setHeader('Content-Type', 'application/json');
                                  res.end(JSON.stringify({error: error}))    
                              }
                              else
                              {
                                  // OK, set the response
                                  res.statusCode = 200;
                                  res.setHeader('Content-Type', 'application/json');
                                  res.end(JSON.stringify(gameState));
                              }
                          }
                      });
                  }
                  else
                  {
                      // Sorry, we can't do this
                      res.writeHead(400, "Bad Request", {'Content-Type': 'application/json'});
                      res.end(JSON.stringify({error: "No User Cookie found"}));
                  }
              }
          }
          catch(err)
          {
              // Oops - couldn't read the body
              res.writeHead(400, "Bad Request", {'Content-Type': 'application/json'});
              res.end(JSON.stringify({error: "Couldn't read body"}));
          }
      });
  }
  else
  {
      // We only support GET right now
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({error: "Only GET is supported now"}));
  }
});


server.listen(port, host, () => {
  console.log('Server listening on port ' + host + ':' + port);
});

function GetKeyValue(fullbody, keyname)
{
    var value = null;

    // First let's see if there's a userID passed in the body
    var params = fullbody.split("&");
    for (var i = 0; i < params.length; i++)
    {
        var valuePair = params[i].split("=");

        if (valuePair && (valuePair.length == 2) && (valuePair[0] == keyname))
        {
            // We're going to use this
            value = valuePair[1];
        }
    }

    return value;
}

function ParseUserID(request, fullbody) 
{
    var userID = null;
    var list = {};
    var rc = request.headers.cookie;

    // First let's see if there's a userID passed in the body
    userID = GetKeyValue(fullbody, "userID");

    // If a userID wasn't passed in, look at the cookies instead
    if (!userID)
    {
        rc && rc.split(';').forEach(function( cookie ) {
            var parts = cookie.split('=');
            list[parts.shift().trim()] = decodeURI(parts.join('='));
        });

        userID = list["BJTutorSession"];
    }

    return userID;
}

function TextToRules(ruleText)
{
    var rules = {hitSoft17:false, surrender:"late", double:"any", doubleaftersplit:true, 
             resplitAces:false, blackjackBonus:0.5, numberOfDecks:1, minBet:0, maxBet:0 };
    var params = ruleText.split("&");

    for (var i = 0; i < params.length; i++)
    {
        var valuePair = params[i].split("=");

        if (valuePair && (valuePair.length == 2))
        {
            switch (valuePair[0])
            {
                case "minBet":
                    rules.minBet = valuePair[1];
                    break;

                case "maxBet":
                    rules.maxBet = valuePair[1];
                    break;

                case "hitSoft17":
                    rules.hitSoft17 = valuePair[1];
                    break;

                case "surrender":
                    rules.surrender = valuePair[1];
                    break;

                case "double":
                    rules.double = valuePair[1];
                    break;

                case "doubleaftersplit":
                    rules.doubleAfterSplit = valuePair[1];
                    break;

                case "resplitAces":
                    rules.resplitAces = valuePair[1];
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
    
    return rules;
}
