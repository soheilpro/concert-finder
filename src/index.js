var express = require("express");
var compression = require("compression");
var sass = require("node-sass-middleware");
var nconf = require("nconf");
var async = require("async");
var _ = require("underscore");
var Songkick = require("./songkick");

var argv = require("optimist")
    .alias("c", "config")
    .default("c", "config.json")
    .argv;

nconf
  .env()
  .file({ file: argv.config })
  .defaults({
    "port": 80
  });

var app = express();
app.set("view engine", "jade");
app.locals._ = _;

app.use(compression())
app.use(sass({ src: "./", response: true }));
app.use("/assets", express.static("assets"));

app.get("/", function(request, response, next) {
  var username = request.query.username;

  if (!username)
    return response.render("index");

  var songkick = new Songkick(nconf.get("songkick.apikey"));

  songkick.getTrackedArtists(username, function(error, artists) {
    if (error)
      return response.render("index", {
        username: username,
        error: (error instanceof Songkick.UserNotFoundError) ? "Ummm, you sure that's your Songkick username?" : "Something's wrong."
      });

    songkick.getArtistsEvents(artists, function(error, events) {
      if (error)
        return next(error);

      events.forEach(function(event) {
        event.isFestival = event.type === "Festival";

        var performances = _.partition(event.performance, function(performance) {
          return _.some(artists, function(artist) {
            return artist.id === performance.artist.id;
          });
        });

        event.performance = performances[0];
        event.performanceByOtherArtists = performances[1];
      });

      var locations = _.chain(events)
        .map(function(event) {
          return event.location;
        })
        .uniq(function(location) {
          return location.city;
        })
        .sortBy(function(location) {
          return location.city;
        }).value();

      var countries = _.chain(locations)
        .map(function(location) {
          var cityParts = location.city.split(", ");
          return cityParts[cityParts.length - 1];
        })
        .uniq()
        .sortBy()
        .value();

      response.render("events", {
        artists: artists,
        events: events,
        locations: locations,
        countries: countries,
        google: {
          maps: {
            apikey: nconf.get("google.maps.apikey")
          }
        }
      });
    });
  });
});

app.listen(nconf.get("port"), function() {
  console.log("Listening on port %d", this.address().port);
});