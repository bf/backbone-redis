//    backbone-redis
//    (c) 2011 Beau Sorensen
//    backbone-redis may be freely distributed under the MIT license.
//    For all details and documentation:
//    https://github.com/sorensen/backbone-redis

(function() {

    // Save a reference to the global object.
    var root = this;

    // The top-level namespace. All public classes and modules will
    // be attached to this.
    var core;

    // Remote server socket connection reference
    var socket;

    // Default socket event listener
    var listener = 'message';

    // Storage container for subscribed models, allowing the returning method
    // calls from the server know where and how to find the model in question
    var Store = {};

    // Available method calls
    var methods = [
        'created', 'updated', 'deleted',
        'subscribed', 'unsubscribed'
    ];

    // Require Underscore, if we're on the server, and it's not already present.
    var _ = root._;
    if (!_ && (typeof require !== 'undefined')) _ = require('underscore')._;

    // Require Backbone, if we're on the server, and it's not already present.
    var Backbone = root.Backbone;
    if (!Backbone && (typeof require !== 'undefined')) Backbone = require('backbone');

    // Wrap an optional error callback with a fallback error event.
    var wrapError = function(onError, model, options) {
        return function(resp) {
            if (onError) {
                onError(model, resp, options);
            } else {
                options.silent || model.trigger('error', model, resp, options);
            }
        };
    };
    
    // Wrap an optional success callback with a fallback error event, renamed to 
    // `finished` to avoid conflicts with Backbone's internal `success` methods.
    var wrapFinished = function(onFinished, model, options) {
        return function(resp) {
            if (onFinished) {
                onFinished(model, resp, options);
            } else {
                options.silent || model.trigger('success', model, resp, options);
            }
        };
    };

    _.mixin({
    
        // ###getUrl
        // Helper function to get a URL from a Model or Collection as a property
        // or as a function.
        getUrl : function(object) {
            if (!(object && object.url)) return null;
            return _.isFunction(object.url) ? object.url() : object.url;
        }
    });

    core = {
    
        //###config
        // Set all of the various configuration settings, and establish 
        // the main handler for incomming socket messages
        config : function(options, next) {
            options.io && (socket = options.io);
            options.listener && (listener = options.listener);
            socket && socket.on(listener, function (model, options) {
                core.process(model, options);
            });
            next && next();
        },

        //###process
        process : function(model, options) {
            console.log("(bbRedis) process request", model, options);
            if (!options || !options.method) return;
            if (!options.method in methods) return;
            core[options.method](model, options);
        },

        // CRUD routines
        //--------------

        //###created
        // A model has been created on the server,
        // get the model or collection based on channel
        // name or url to set or add the new data
        created : function(data, options) {
            console.log("(bbRedis)  ******* STORE: ", Store);
            var model = Store[options.channel];
            // Model processing
            if (model instanceof Backbone.Model) {
                model.set(model.parse(data));
            // Collection processing
            } else if (model instanceof Backbone.Collection) {
                if (!model.get(data.id)) model.add(model.parse(data));
            }
        },

        //###updated
        // A model has been updated with new data from the
        // server, set the appropriate model or collection
        updated : function(data, options) {
            var model = Store[options.channel];
            // Collection processing
            if (model.get(data.id)) {
                model.get(data.id).set(model.parse(data));
            // Model processing
            } else {
                model.set(model.parse(data));
            }
        },

        //###deleted
        // A model has been deleted
        deleted : function(data, options) {
            Store[options.channel].remove(data) || delete Store[options.channel];
        },

        // Pubsub routines
        //----------------

        //###subscribed
        // Someone has subscribed to a channel
        // Note: This method is not required to run the
        // application, it may prove as a useful way to
        // update clients, and it may prove to be an added
        // security risk, when private channels are involved
        subscribed : function(data, options) {
            var model = Store[options.channel];
            if (!options.silent) model.trigger('subscribe', options);
        },

        //###unsubscribed
        // Someone has unsubscribed from a channel, see the
        // note above, as it applies to this method as well
        unsubscribed : function(data, options) {
            var model = Store[options.channel];
            if (!options.silent) model.trigger('unsubscribe', options);
        }
    };

    // Extend default Backbone functionality
    _.extend(Backbone.Model.prototype, {

        //###url
        // This should probably be overriden with the underscore mixins
        // from the helpers.js methods
        url : function() {
            var base = _.getUrl(this.collection) || this.urlRoot || '';
            if (this.isNew()) return base;
            return base + (base.charAt(base.length - 1) == ':' ? '' : ':') + encodeURIComponent(this.id);
        },

        //###publish
        // Publish model data to the server for processing, this serves as
        // the main entry point for client to server communications.  If no
        // method is provided, it defaults to an 'update', which is the least
        // conflicting method when returned to the client for processing
        publish : function(options, next) {
            var model = this;
            options         || (options = {});
            options.channel || (options.channel = (model.collection) ? _.getUrl(model.collection) : _.getUrl(model));
            options.method = 'publish';
            options.error = wrapError(options.error, model, options);
            
            if (!socket) {
                options.error();
                return;
            }
            socket.emit(listener, model.toJSON(), options, function(response){
                if (!options.silent) model.trigger('publish', response);
                next && next(response);
            });
            return this;
        }
    });

    // Common extention object for both models and collections
    var common = {

        //###subscribe
        // Subscribe to the 'Server' for model changes, if 'override' is set to true
        // in the options, this model will replace any other models in the local
        // 'Store' which holds the reference for future updates. Uses Backbone 'url'
        // for subscriptions, relabeled to 'channel' for clarity
        subscribe : function(options, next) {
            var model = this;
            options         || (options = {});
            options.type    || (options.type = model.type || model.collection.type);
            options.channel || (options.channel = (model.collection) ? _.getUrl(model.collection) : _.getUrl(model));
            options.method = 'subscribe';
            options.error = wrapError(options.error, model, options);
            
            if (!socket) {
                options.error();
                return;
            }
            // Add the model to a local object container so that other methods
            // called from the 'Server' have access to it
            if (!Store[options.channel] || options.override) {
                Store[options.channel] = model;
                socket.emit(listener, false, options, function(response) {
                    next && next(response);
                });
            } else {
                next && next(response);
            }
            return this;
        },

        //###unsubscribe
        // Stop listening for published model data, removing the reference in the local
        // subscription 'Store', will trigger an unsubscribe event unless 'silent'
        // is passed in the options
        unsubscribe : function(options, next) {
            var model = this;
            options         || (options = {});
            options.type    || (options.type = model.type || model.collection.type);
            options.channel || (options.channel = (model.collection) ? _.getUrl(model.collection) : _.getUrl(model));
            options.method = 'unsubscribe';
            options.error = wrapError(options.error, model, options);
            
            if (!socket) {
                options.error();
                return;
            }
            socket.emit(listener, false, options, function(response) {
                next && next(response);
            });

            // The object must be deleted, or a new subscription with the same
            // channel name will not be correctly 'synced', unless a 'override'
            // option is sent upon subscription
            delete Store[options.channel];
            return this;
        }
    };

    // Add to underscore utility functions to allow optional usage
    // This will allow other storage options easier to manage, such as
    // 'localStorage'. This must be set on the model and collection to
    // be used on directly. Defaults to 'Backbone.sync' otherwise.
    _.mixin({

        //###sync
        // Set the model or collection's sync method to communicate through socket.io
        sync : function(method, model, options) {
            if (!socket) return (options.error && options.error(503, model, options));

            // Set the RPC options for model interaction
            options.type    || (options.type = model.type || model.collection.type);
            options.channel || (options.channel = (model.collection) ? _.getUrl(model.collection) : _.getUrl(model));
            options.method  || (options.method = method);
            options.error = wrapError(options.error, model, options);
            options.finished = wrapFinished(options.finished, model, options);

            // Only a `read` event will return directly, all other methods 
            // are simply pushed to the server, and then caught on the 
            // returning published event
            if (method === 'read') {
                socket.emit(listener, model, options, function(results) {
                    options.success(results);
                });
            }
            else socket.emit(listener, model.toJSON(), options, function(resp) {
                options.finished(resp);
            });
        }
    });

    // Extend both model and collection with the pub/sub mechanics
    _.extend(Backbone.Model.prototype, common);
    _.extend(Backbone.Collection.prototype, common);

    // Exported for both CommonJS and the browser.
    if (typeof exports !== 'undefined') module.exports = core;
    else root.bbRedis = core;

}).call(this)
