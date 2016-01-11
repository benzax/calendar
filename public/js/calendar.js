$(function() {

  Parse.$ = jQuery;

  // Initialize Parse with your Parse application javascript keys
  Parse.initialize("TE4q6ZBPADb0MQNBxT9U7ueOyNT0CImidfmRyoag",
                   "xHTUCYKYCFzIoLm6Cy04ADbvJ1fHTiLUHoYFGNJg");

  var RSVPModel = Parse.Object.extend("Todo", { // TODO: should probably be "RSVP" instead; needs server-side fix
    defaults: {
      username: null,
      user: null,
      content: null, // content = day; TODO rename on server side
      done: false // done = yes; TODO rename on server side
    },

    setYes: function(yes) {
      this.save({ done: yes });
    }
  });

  // TODO: eliminate the need for this by storing an array on the server side, maybe.
  var dayIndex = {
    Monday: 0,
    Tuesday: 1,
    Wednesday: 2,
    Thursday: 3,
    Friday: 4
  };
  var days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  var OthersRSVPList = Parse.Collection.extend({
    model: RSVPModel,

    getRenderData: function() {
      var responses = {};
      this.models.forEach(function(model) {
        var username = model.get("username");
        var day = model.get("content");
        var yes = model.get("done");

        if (username) {
          // TODO when would this be false??

          if (!(username in responses)) {
            responses[username] = {
              username: username,
              isCurrentUser: false,
              yeses: []
            };
          }

          responses[username].yeses[dayIndex[day]] = yes;
        }
      });

      return _.values(responses);
    }
  });

  // TODO how much of this is needed? E.g. maybe Parse needs some of these; if so, document which.
  var ThisUserRSVPList = Parse.Collection.extend({
    model: RSVPModel,

    // Create new items (for new users)
    createAll: function() {
      this.createEntry("Monday");
      this.createEntry("Tuesday");
      this.createEntry("Wednesday");
      this.createEntry("Thursday");
      this.createEntry("Friday");
    },

    comparator: function (model) {
      return dayIndex[model.get("content")];
    },

    createEntry: function(day) {
      var acl = new Parse.ACL(Parse.User.current());
      acl.setPublicReadAccess(true); // In long run, scope to friends

      this.create({
        content:  day,
        done:     false, // done = yes
        user:     Parse.User.current(),
        username: Parse.User.current().get("Name"),
        ACL:      acl
      });
    },

    getRenderData: function() {
      return {
        username: Parse.User.current().get("Name"),
        isCurrentUser: true,
        yeses: this.models.map(function (model) { return model.get('done'); })
      };
    }
  });

  var RSVPListView = Parse.View.extend({
    rowTemplate: _.template($("#calendar-row-template").html()),

    events: {
      "click [data-dayindex]": "updateThisUserRSVPs"
    },

    initialize: function() {
      this.thisUserRSVPs = new ThisUserRSVPList();

      // Setup the query for the collection to look for RSVPs from the current user
      this.thisUserRSVPs.query = new Parse.Query(RSVPModel);
      this.thisUserRSVPs.query.equalTo("user", Parse.User.current());

      // Fetch all the RSVPs for this user
      this.thisUserRSVPs.fetch({
        success: function(rsvps) {
          // If no saved items, create them!
          if (!rsvps.length) {
            rsvps.createAll();
          }
          this.render();
        }.bind(this)
      });

      this.othersRSVPs = new OthersRSVPList();

      // TODO: it appears we could probably unify into a single collection instead of separate...
      this.othersRSVPs.query = new Parse.Query(RSVPModel);
      this.othersRSVPs.query.notEqualTo("user", Parse.User.current());

      // Fetch all the todo items for this user
      this.othersRSVPs.fetch({
        success: function(rsvps) {
          this.render();
        }.bind(this)
      });
    },

    render: function() {
      var thisUserHTML = this.rowTemplate(this.thisUserRSVPs.getRenderData());
      var othersHTML = this.othersRSVPs.getRenderData().reduce(function (soFar, data) {
        return soFar + this.rowTemplate(data);
      }.bind(this), "");

      this.$el.html(thisUserHTML + othersHTML);

      // Make Material Design Light do its thing.
      Array.prototype.forEach.call(this.el.querySelectorAll('[class^="mdl-"]'), function (el) {
        componentHandler.upgradeElement(el);
      });
    },

    updateThisUserRSVPs: function(e) {
      // This isn't great practice, but it's a bit simpler than having a view per checkbox.
      // If we straighten out the data model a bit we can also clean this up.
      var changedIndex = e.target.getAttribute("data-dayindex");
      var checked = e.target.checked;

      var model = this.thisUserRSVPs.find(function (model) { return model.get('content') === days[changedIndex]; });
      console.log("found model", model.attributes);
      model.setYes(checked);
    }
  });

  var AppView = Parse.View.extend({
    events: {
      "click .log-out": "logOut",
      "submit form.login-form": "logIn",
      "submit form.signup-form": "signUp"
    },

    mainTemplates: {
      login: _.template($("#login-template").html()),
      calendar: _.template($("#calendar-template").html())
    },
    footerTemplates: {
      login: _.template(""),
      calendar: _.template($("#calendar-footer-template").html())
    },

    render: function() {
      if (Parse.User.current()) {
        this.renderInState("calendar");
      } else {
        this.renderInState("login");
      }
    },

    renderInState: function(state) {
      this.$("main").html(this.mainTemplates[state]());
      this.$("footer").html(this.footerTemplates[state]());

      if (state === "calendar") {
        new RSVPListView({ el: this.$("#availability-table tbody") });
      }
    },

    logOut: function() {
      Parse.User.logOut();
      this.renderInState("login");
    },

    logIn: function(e) {
      var username = this.$("#login-username").val();
      var password = this.$("#login-password").val();
      this.$(".login-form button").prop("disabled", true);

      Parse.User.logIn(username, password, {
        success: function(user) {
          this.renderInState("calendar");
        }.bind(this),

        error: function(user, error) {
          this.$(".login-form .error").html("Invalid username or password. Please try again.").show();
          this.$(".login-form button").prop("disabled", false);
        }.bind(this)
      });

      e.preventDefault();
    },

    signUp: function(e) {
      var username = this.$("#signup-username").val();
      var password = this.$("#signup-password").val();
      this.$(".login-form button").prop("disabled", true);

      Parse.User.signUp(username, password, {
        Name : username,
        ACL: new Parse.ACL()
      },
      {
        success: function(user) {
          this.renderInState("calendar");
        }.bind(this),

        error: function(user, error) {
          this.$(".login-form .error").text(error.message).show();
          this.$(".login-form button").prop("disabled", false);
        }.bind(this)
      });

      e.preventDefault();
    },
  });

  (new AppView({ el: document.body })).render();
});
