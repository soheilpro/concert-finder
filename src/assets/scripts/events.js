var _filteredEvents = _events;
var _selectedEvent;
var _map;
var _markers;
var _listItems;
var _calendar = new GregorianCalendar();

function GregorianCalendar() {
}

GregorianCalendar.prototype.formatDate = function(date) {
  return date.format("MMM D, YYYY");
};

function JalaliCalendar() {
  this.monthNames = ["Farvardin", "Ordibehesht", "Khordad", "Tir", "Mordad", "Shahrivar", "Mehr", "Aban", "Azar", "Dey", "Bahman", "Esfand"];
}

JalaliCalendar.prototype.formatDate = function(date) {
  var gDate = date.toArray();
  var jDate = gregorian_to_jalali([gDate[0], gDate[1] + 1, gDate[2]]);
  return jDate[2] + " " + this.monthNames[jDate[1] - 1] + " " + jDate[0];
};

Handlebars.registerHelper("daysRemaining", function(date) {
  var diff = new moment(date).diff(new moment(), "days");

  if (diff <= 0)
    return "";

  if (diff < 30)
    return diff + "d";

  return Math.floor(diff / 30) + "mo";
});

Handlebars.registerHelper("formatDate", function(date) {
  if (!date)
    return "";

  return _calendar.formatDate(moment(date));
});

$(function() {
  $("#date-filter-input").ionRangeSlider({
    type: "double",
    min: moment(_events[0].start.date).format("X"),
    max: moment(_events[_events.length - 1].start.date).format("X"),
    force_edges: true,
    prettify: function(value) {
      return _calendar.formatDate(moment(value, "X"));
    },
    onFinish: filterEvents
  });

  $("#calendar-option-input").multipleSelect({
    single: true,
    onClick: function(view) {
      switch (view.value) {
        case "gregorian":
          _calendar = new GregorianCalendar();
            break;

        case "jalali":
          _calendar = new JalaliCalendar();
          break;

        default:
          throw new "Not supported."
      }

      $("#date-filter-input").data("ionRangeSlider").update({});
      _listItems = null;
      updateList();
    }
  });

  $("#artist-filter-input").multipleSelect({
    allSelected: "All artists",
    filter: true,
    onClick: filterEvents,
    onCheckAll: filterEvents,
    onUncheckAll: filterEvents
  })
  .multipleSelect("checkAll");

  $("#location-filter-input").multipleSelect({
    allSelected: "All locations",
    filter: true,
    onClick: filterEvents,
    onCheckAll: filterEvents,
    onUncheckAll: filterEvents,
    onOptgroupClick: filterEvents
  })
  .multipleSelect("checkAll");

  $("#type-filter-input").multipleSelect({
    selectAll: false,
    allSelected: "Concerts + Festivals",
    onClick: filterEvents,
    onCheckAll: filterEvents,
    onUncheckAll: filterEvents
  })
  .multipleSelect("checkAll");

  $("#visible-events-only-input").change(function() {
    updateList();
  });

  filterEvents();
});

function initMap() {
  _map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 24.5154115, lng: 17.5781213 },
    zoom: 2
  });

  _map.addListener("dragend", function() {
    updateList();
  });

  _map.addListener("zoom_changed", function() {
    updateList();
  });

  updateMap();
}

function filterEvents() {
  var dateFrom = moment($("#date-filter-input").data().from, "X");
  var dateTo = moment($("#date-filter-input").data().to, "X");
  var locations = $("#location-filter-input").val();
  var artists = $("#artist-filter-input").val();
  var types = $("#type-filter-input").val();

  _filteredEvents = _.filter(_events, function(event) {
    return moment(event.start.date).isBetween(dateFrom, dateTo) &&
      _.contains(locations, event.location.city) &&
      _.some(event.performance, function(performance) { return _.contains(artists, performance.artist.id.toString()); }) &&
      _.contains(types, event.type);
  });

  updateMap();
  updateList();
}

function updateMap() {
  if (!_map)
    return;

  if (!_markers) {
    _markers = [];

    _events.forEach(function(event) {
      if (!event.location.lat || !event.location.lng)
        return;

      var marker = new google.maps.Marker({
        position: event.location
      });

      marker.event = event;
      marker.setMap(_map);

      marker.addListener("click", function() {
        selectEvent(event, { selectOnList: true });
      });

      _markers.push(marker);
    });
  }

  var mapEvents = _filteredEvents;

  _markers.forEach(function(marker) {
    marker.setVisible(_.contains(mapEvents, marker.event));
  });
}

function updateList() {
  if (!_listItems) {
    var template = Handlebars.compile($("#list-item-template").html());

    _listItems = [];

    _events.forEach(function(event) {
      var listItem = $(template(event));
      listItem.event = event;

      _listItems.push(listItem);
    });

    $("#list").empty().append(_listItems);
  }

  var listEvents = _filteredEvents;
  var visibleEventsOnlyValue = $("#visible-events-only-input").prop('checked');

  if (_map && visibleEventsOnlyValue) {
    var bounds = _map.getBounds();

    if (bounds) {
      listEvents = _.filter(listEvents, function(event) {
        return bounds.contains(new google.maps.LatLng(event.location.lat, event.location.lng));
      });
    }
  }

  _listItems.forEach(function(listItem) {
    listItem.toggle(_.contains(listEvents, listItem.event));
  });

  $("#list")[0].scrollTop = 0;
}

function selectEvent(event, options) {
  if (_selectedEvent) {
    $("#event-" + _selectedEvent.id).removeClass("selected");
  }

  $("#event-" + event.id).addClass("selected");

  if (options.selectOnList)
    $("#event-" + event.id)[0].scrollIntoView();

  if (_map && options.selectOnMap)
    _map.setCenter(new google.maps.LatLng(event.location.lat, event.location.lng));

  _selectedEvent = event;
}

function getEvent(id) {
  return _.find(_events, function(event) {
    return event.id === id;
  });
}
