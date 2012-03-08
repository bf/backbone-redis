  var socket = io.connect();
  socket.on('connect', function () {
    $('#conn_status').text('Connected!')
  });

  bbRedis.config({
    io : socket,
    listener : 'backbone'
  });

  // Todo Model
  // ----------

  // Our basic **Todo** model has `content`, `order`, and `done` attributes.
  window.Todo = Backbone.Model.extend({

    // Server communication settings
    url  : 'todos',
    type : 'todo',
    sync : _.sync,

    // Default attributes for the todo.
    defaults: {
      content: "empty todo...",
      done: false,
      dirty: "dirty data",
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
    },

    // Remove this Todo from *localStorage* and delete its view.
    clear: function() {
      this.destroy();
      this.view.remove();
    }

  });