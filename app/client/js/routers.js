// window.App = new MaverickRouter({ appendTo: $('#app') });

var MaverickRouter = Backbone.Router.extend({
  routes: {
    "" : "app",
    "/" : "app",
  },

  initialize: function() {
    this.Views = {
      // maverick: new MaverickView(),
    };
  },

  app: function() {
    // var accounts = new AccountsCollection();
    // var triggers = new TriggersCollection();
    var logs = new LogsCollection();
    // this.Views.maverick.reset(accounts, triggers, logs);
  },
});