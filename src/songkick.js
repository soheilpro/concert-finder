var util = require('util');
var fs = require("fs");
var request = require("request");
var async = require("async");
var colors = require('colors');
var mkdirp = require('mkdirp');
var HTTPError = require('node-http-error');
var _ = require("underscore");

function LocalSource() {
  this.path = "../cache";
}

LocalSource.prototype.loadTrackedArtists = function(username, callback) {
  var filename = this.path + "/artists-" + username + ".json";

  fs.readFile(filename, "utf8", function(error, data) {
    if (error)
      return callback(error);

    fs.stat(filename, function(error, stats) {
      if (error)
        return callback(error);

      callback(null, JSON.parse(data), stats.mtime);
    });
  });
};

LocalSource.prototype.loadArtistEvents = function(artist, page, callback) {
  var filename = this.path + "/" + artist.id + "-" + page + ".json";

  fs.readFile(filename, "utf8", function(error, data) {
    if (error)
      return callback(error);

    fs.stat(filename, function(error, stats) {
      if (error)
        return callback(error);

      callback(null, JSON.parse(data), stats.mtime);
    });
  });
};

LocalSource.prototype.saveTrackedArtists = function(username, data, callback) {
  var _this = this;
  var filename = this.path + "/artists-" + username + ".json";

  mkdirp(_this.path, function(error) {
    if (error)
      return callback(error);

    fs.writeFile(filename, JSON.stringify(data), "utf8", callback);
  });
};

LocalSource.prototype.saveArtistEvents = function(artist, page, data, callback) {
  var _this = this;
  var filename = this.path + "/" + artist.id + "-" + page + ".json";

  mkdirp(_this.path, function(error) {
    if (error)
      return callback(error);

    fs.writeFile(filename, JSON.stringify(data), "utf8", callback);
  });
};

function NetSource(apiKey) {
  this.apiKey = apiKey;
}

NetSource.prototype.loadTrackedArtists = function(username, callback) {
  request("http://api.songkick.com/api/3.0/users/" + username + "/artists/tracked.json?apikey=" + this.apiKey + "&per_page=all", function(error, response, body) {
    if (error)
      return callback(error);

    if (response.statusCode == 404)
      return callback(new UserNotFoundError());

    if (response.statusCode != 200)
      return callback(new HTTPError(response.statusCode, response.statusMessage), null);

    callback(null, JSON.parse(body), new Date());
  });
};

NetSource.prototype.loadArtistEvents = function(artist, page, callback) {
  request("http://api.songkick.com/api/3.0/artists/" + artist.id + "/calendar.json?apikey=" + this.apiKey + "&per_page=50&page=" + page, function(error, response, body) {
    if (error)
      return callback(error);

    if (response.statusCode != 200)
      return callback(new HTTPError(response.statusCode, response.statusMessage), null);

    callback(null, JSON.parse(body), new Date());
  });
};

function CachingNetSource(apiKey) {
  this.localSource = new LocalSource();
  this.netSource = new NetSource(apiKey);
}

CachingNetSource.prototype.loadTrackedArtists = function(username, callback) {
  var _this = this;

  _this.localSource.loadTrackedArtists(username, function(error, localData, localDateTime) {
    if (error || !localData || !_this.isFresh(localDateTime)) {
      return _this.netSource.loadTrackedArtists(username, function(error, netData, netDateTime) {
        if (error)
          return callback(error);

        _this.localSource.saveTrackedArtists(username, netData);
        callback(null, netData);
      });
    }

    callback(null, localData);
  });
};

CachingNetSource.prototype.loadArtistEvents = function(artist, page, callback) {
  var _this = this;

  _this.localSource.loadArtistEvents(artist, page, function(error, localData, localDateTime) {
    if (error || !localData || !_this.isFresh(localDateTime)) {
      return _this.netSource.loadArtistEvents(artist, page, function(error, netData, netDateTime) {
        if (error)
          return callback(error);

        _this.localSource.saveArtistEvents(artist, page, netData);
        callback(null, netData);
      });
    }

    callback(null, localData);
  });
};

CachingNetSource.prototype.isFresh = function(dateTime) {
  var now = new Date();

  return (dateTime.getFullYear() === now.getFullYear() &&
          dateTime.getMonth() === now.getMonth() &&
          dateTime.getDate() === now.getDate());
}

function Songkick(apiKey) {
  this.source = new CachingNetSource(apiKey);
}

Songkick.prototype.getTrackedArtists = function(username, callback) {
  var _this = this;

  _this.source.loadTrackedArtists(username, function(error, data) {
    if (error)
      return callback(error);

    var artists = data.resultsPage.results.artist;

    callback(null, artists);
  });
}

Songkick.prototype.getArtistEvents = function(artist, callback) {
  var _this = this;

  var events = [];
  var page = 0;
  var perPage;
  var totalEntries;

  async.doWhilst(
    function(callback) {
      _this.source.loadArtistEvents(artist, page + 1, function(error, data) {
        if (error)
          return callback(error);

        events = events.concat(data.resultsPage.results.event || []);
        page = data.resultsPage.page;
        perPage = data.resultsPage.perPage;
        totalEntries = data.resultsPage.totalEntries;

        callback();
      });
    },
    function() {
      return (totalEntries > page * perPage);
    },
    function(error) {
      callback(error, events);
    }
  );
}

Songkick.prototype.getArtistsEvents = function(artists, callback) {
  var _this = this;

  var events = [];

  async.eachLimit(artists, 10, function(artist, callback) {
    _this.getArtistEvents(artist, function(error, artistEvents) {
      if (error)
        return callback(error);

      events = events.concat(artistEvents);

      callback();
    });
  },
  function(error) {
    if (error)
      return callback(error);

    events = _.uniq(events, function(event) {
      return event.id;
    });

    events = _.sortBy(events, function(event) {
      return event.start.date;
    });

    callback(null, events);
  });
}

function UserNotFoundError(message) {
  Error.call(this);
  this.message = message;
}

util.inherits(UserNotFoundError, Error);

Songkick.UserNotFoundError = UserNotFoundError;

module.exports = Songkick;
