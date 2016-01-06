$(function() {

  Parse.$ = jQuery;

  // Initialize Parse with your Parse application javascript keys
  Parse.initialize("TE4q6ZBPADb0MQNBxT9U7ueOyNT0CImidfmRyoag",
                   "xHTUCYKYCFzIoLm6Cy04ADbvJ1fHTiLUHoYFGNJg");

  // Todo Model
  // ----------

  // Our basic Todo model has `content`, `order`, and `done` attributes.
  var Todo = Parse.Object.extend("Todo", {
    // Default attributes for the todo.
    defaults: {
      content: "empty todo...",
      done: false
    },

    // Ensure that each todo created has `content`.
    initialize: function() {
      if (!this.get("content")) {
        this.set({"content": this.defaults.content});
      }
    },

    // Toggle the `done` state of this todo item.
    toggle: function() {
      this.save({done: !this.get("done")});
    }
  });

  var RsvpList = Parse.Collection.extend({
    
    model: Todo,

    makeTable() {
      console.log(this);
      var responses = {};
      for (var i=0; i < this.models.length; ++i) {
        var user = this.models[i].get("username");
        if (user) {
          console.log(user);
          if (!(user in responses)) {
            responses[user] = {name: user};
          }
          responses[user][this.models[i].get("content").toLowerCase()] =
              this.models[i].get("done");
        }
      }
      console.log(responses);
      for (var key in responses) {
        this.addOne(responses[key]);
      };
    }

  });

  // Todo Collection
  // ---------------

  var TodoList = Parse.Collection.extend({

    // Reference to this collection's model.
    model: Todo,

    // Filter down the list of all todo items that are finished.
    done: function() {
      return this.filter(function(todo){ return todo.get('done'); });
    },

    // Filter down the list to only todo items that are still not finished.
    remaining: function() {
      return this.without.apply(this, this.done());
    },

    // We keep the Todos in sequential order, despite being saved by unordered
    // GUID in the database. This generates the next order number for new items.
    nextOrder: function() {
      if (!this.length) return 1;
      return this.last().get('order') + 1;
    },

    // Todos are sorted by their original insertion order.
    comparator: function(todo) {
      return todo.get('order');
    },
    
    // Create new items (for new users)
    createAll: function() {
      this.createEntry("Monday");
      this.createEntry("Tuesday");
      this.createEntry("Wednesday");
      this.createEntry("Thursday");
      this.createEntry("Friday");
    },

    createEntry: function(content) {
      var acl = new Parse.ACL(Parse.User.current());
      acl.setPublicReadAccess(true); // In long run, scope to friends

      this.create({
        content: content,
        order:   this.nextOrder(),
        done:    false,
        user:    Parse.User.current(),
        username: Parse.User.current().get("Name"),
        ACL:     acl
      });
    }

  });

  // Todo Item View
  // --------------

  // The DOM element for a todo item...
  var TodoView = Parse.View.extend({

    //... is a list tag.
    tagName:  "li",

    // Cache the template function for a single item.
    template: _.template($('#item-template').html()),

    // The DOM events specific to an item.
    events: {
      "click .toggle"              : "toggleDone",
      "dblclick label.todo-content" : "edit",
      "blur .edit"          : "close"
    },

    // The TodoView listens for changes to its model, re-rendering. Since there's
    // a one-to-one correspondence between a Todo and a TodoView in this
    // app, we set a direct reference on the model for convenience.
    initialize: function() {
      _.bindAll(this, 'render', 'close', 'remove');
      this.model.bind('change', this.render);
    },

    // Re-render the contents of the todo item.
    render: function() {
      $(this.el).html(this.template(this.model.toJSON()));
      this.input = this.$('.edit');
      return this;
    },

    // Toggle the `"done"` state of the model.
    toggleDone: function() {
      this.model.toggle();
    },

    // Switch this view into `"editing"` mode, displaying the input field.
    edit: function() {
      $(this.el).addClass("editing");
      this.input.focus();
    },

    // Close the `"editing"` mode, saving changes to the todo.
    close: function() {
      this.model.save({content: this.input.val()});
      $(this.el).removeClass("editing");
    },

  });


  // Rsvp View
  // --------------

  // The DOM element for a friend's rsvp
  var RsvpView = Parse.View.extend({

    //... is a table row
    tagName:  "tr",

    // Cache the template function for a single item.
    template: _.template($('#rsvp-template').html()),

    initialize: function() {
    },

    // Re-render the contents of the todo item.
    render: function() {
      // not sure why constructor magic doesn't work here
      $(this.el).html(this.template(this.options.data));
      return this;
    },

  });

  // The Application
  // ---------------

  // The main view that lets a user manage their todo items
  var ManageTodosView = Parse.View.extend({

    // Delegated events for creating new items, and clearing completed ones.
    events: {
      "click #toggle-all": "toggleAllComplete",
      "click .log-out": "logOut",
    },

    el: ".content",

    // At initialization we bind to the relevant events on the `Todos`
    // collection, when items are added or changed. Kick things off by
    // loading any preexisting todos that might be saved to Parse.
    initialize: function() {
      var self = this;

      _.bindAll(this, 'addOne', 'addAll', 'render', 'toggleAllComplete', 'logOut');

      // Main todo management template
      this.$el.html(_.template($("#manage-calendar-template").html()));
      
      this.input = this.$("#prompt"); // should be disabled
      this.allCheckbox = this.$("#toggle-all")[0];

      // Create our collection of Todos
      this.todos = new TodoList;

      // Setup the query for the collection to look for todos from the current user
      this.todos.query = new Parse.Query(Todo);
      this.todos.query.equalTo("user", Parse.User.current());
        
      this.todos.bind('add',     this.addOne);
      this.todos.bind('reset',   this.addAll);
      this.todos.bind('all',     this.render);

      // Fetch all the todo items for this user
      this.todos.fetch({
        success: function(todos) {
          // If no saved items, create them!
          if (!todos.length) {
            todos.createAll();
          }
        }
      });
    },

    // Logs out the user and shows the login view
    logOut: function(e) {
      Parse.User.logOut();
      new LogInView();
      this.undelegateEvents();
      delete this;
    },

    // Re-rendering the App just means refreshing the statistics -- the rest
    // of the app doesn't change.
    render: function() {
      var remaining = this.todos.remaining().length;

      this.delegateEvents();

      this.allCheckbox.checked = !remaining;
    },

    // Add a single todo item to the list by creating a view for it, and
    // appending its element to the `<ul>`.
    addOne: function(todo) {
      var view = new TodoView({model: todo});
      this.$("#todo-list").append(view.render().el);
    },

    // Add all items in the Todos collection at once.
    addAll: function(collection, filter) {
      this.$("#todo-list").html("");
      this.todos.each(this.addOne);
    },

    toggleAllComplete: function () {
      var done = this.allCheckbox.checked;
      this.todos.each(function (todo) { todo.save({'done': done}); });
    }
  });

  // The main view that lets a user see friends' availability
  var FriendsView = Parse.View.extend({

    el: ".friends-content",

    // At initialization we bind to the relevant events on the `Todos`
    // collection, when items are added or changed. Kick things off by
    // loading any preexisting todos that might be saved to Parse.
    initialize: function() {
      var self = this;

      _.bindAll(this, 'render');

      this.rsvps = new RsvpList;

      // Calendar Template needed, include but list, one for each friend?
      //this.$el.html(_.template($("#friends-calendar-template").html()));
      this.rsvps.query = new Parse.Query(Todo);
      this.rsvps.query.notEqualTo("user", Parse.User.current());
        
      this.rsvps.addOne = _.bind(this.addOne, this);
      //this.todos.bind('reset',   this.addAll);
      //this.todos.bind('all',     this.render);

      // Fetch all the todo items for this user
      this.rsvps.fetch({
        success: function(rsvps) {
          rsvps.makeTable();
        }
      });

      this.render();
    },

    // Re-rendering this probably is irrelevant?
    render: function() {
      this.delegateEvents();
    },

    // Add a friend's rsvps to the list by creating a view for that friend
    // appending its element to the `<table>`.
    addOne: function(rsvp) {
      console.log(rsvp);
      var view = new RsvpView({data: rsvp});
      this.$("#rsvp-list").append(view.render().el);
    },

  });

  var LogInView = Parse.View.extend({
    events: {
      "submit form.login-form": "logIn",
      "submit form.signup-form": "signUp"
    },

    el: ".content",
    
    initialize: function() {
      _.bindAll(this, "logIn", "signUp");
      this.render();
    },

    logIn: function(e) {
      var self = this;
      var username = this.$("#login-username").val();
      var password = this.$("#login-password").val();
      
      Parse.User.logIn(username, password, {
        success: function(user) {
          new ManageTodosView();
          self.undelegateEvents();
          delete self;
        },

        error: function(user, error) {
          self.$(".login-form .error").html("Invalid username or password. Please try again.").show();
          self.$(".login-form button").removeAttr("disabled");
        }
      });

      this.$(".login-form button").attr("disabled", "disabled");

      return false;
    },

    signUp: function(e) {
      var self = this;
      var username = this.$("#signup-username").val();
      var password = this.$("#signup-password").val();
      
      Parse.User.signUp(username, password, { Name : username,
          ACL: new Parse.ACL() }, {
        success: function(user) {
          new ManageTodosView();
          new FriendsView();
          self.undelegateEvents();
          delete self;
        },

        error: function(user, error) {
          self.$(".signup-form .error").html(_.escape(error.message)).show();
          self.$(".signup-form button").removeAttr("disabled");
        }
      });

      this.$(".signup-form button").attr("disabled", "disabled");

      return false;
    },

    render: function() {
      this.$el.html(_.template($("#login-template").html()));
      this.delegateEvents();
    }
  });

  // The main view for the app
  var CalendarView = Parse.View.extend({
    // Instead of generating a new element, bind to the existing skeleton of
    // the App already present in the HTML.
    //el: $("#calendarapp"),

    initialize: function() {
      this.render();
    },

    render: function() {
      new ManageTodosView();
      new FriendsView();
    }
  });

  // The main view for the app
  var AppView = Parse.View.extend({
    // Instead of generating a new element, bind to the existing skeleton of
    // the App already present in the HTML.
    el: $("#calendarapp"),

    initialize: function() {
      this.render();
    },

    render: function() {
      if (Parse.User.current()) {
        new CalendarView();
      } else {
        new LogInView();
      }
    }
  });

  new AppView;
});
