var celery = Npm.require('celery-shoot');
var Future = Npm.require('fibers/future');

/**
 * A dictionary of CeleryClients
 * @type {Object}
 */
CeleryClients = {};

/**
 * Creates a new `CeleryClient` and stores it in `CeleryClients`
 * @param name
 * @constructor
 */
CeleryClient = function (name){
  this._name = name;
  this._connected = false;
  CeleryClients[this._name] = this;
};

_.extend(CeleryClient.prototype, {
  /**
   * Connects synchronously, proxies `conf` through to celery.createClient
   *
   * @param {Object} conf
   * @param {String} [conf.BROKER_URL='amqp://']
   * @param {String} [conf.RESULT_BACKEND]
   * @param {String} [conf.DEFAULT_QUEUE='celery']
   * @param {String} [conf.DEFAULT_EXCHANGE='celery']
   * @param {String} [conf.DEFAULT_EXCHANGE_TYPE='direct']
   * @param {String} [conf.DEFAULT_ROUTING_KEY='celery']
   * @param {String} [conf.RESULT_EXCHANGE='celeryresults']
   * @param {String} [conf.EVENT_EXCHANGE='celeryev']
   * @param {Boolean} [conf.SEND_TASK_SENT_EVENT=false]
   * @param {Number} [conf.TASK_RESULT_EXPIRES=86400000]
   * @param {Object} [conf.ROUTES={}]
   *
   * @throws Error
   *
   * @returns {Boolean}
   */
  connect: function(conf){
    var _this = this,
      future = new Future();

    this._client = celery.createClient(conf);

    this._client.on('connect', function CeleryClient_connect(){
      debug_client(_this._name, 'connected');
      _this._connected = true;
      if (!future.isResolved()){
        future.return(true);
      }
    });

    this._client.on('error', function CeleryClient_error(err){
      debug_client(_this._name, 'connection error', err, err.stack);
      if (!future.isResolved()){
        future.throw(err);
      }
    });

    this._client.on('end', function CeleryClient_end(){
      debug_client(_this._name, 'connection closed');
      _this._connected = false;
    });

    return future.wait()
  },
  createTask: function(name, options, trackStarted, ignoreResult){
    return new CeleryTask(this, name, options, {
      track_started: trackStarted,
      ignore_result: ignoreResult
    });
  },
  /**
   * Calls a Celery Task, returning futures for the result.
   *
   * @param {String} method
   * @param {Array} [args]
   * @param {Boolean} [trackStarted=false] if true, will return two futures, [0] for task started, and [1] for the result.
   * @param {Boolean} [ignoreResult=false] if true, will return null rather than tracking result
   * @returns {Future|Future[]}
   */
  call: function(method, args, trackStarted, ignoreResult){
    return this.createTask(method, {}, trackStarted, ignoreResult).apply(args);
  },
  /**
   * Calls a Celery Task, returning futures for the result.
   *
   * @param {String} method
   * @param {Array} [args]
   * @param {Object} [kwargs]
   * @param {Boolean} [trackStarted=false] if true, will return two futures, [0] for task started, and [1] for the result.
   * @param {Boolean} [ignoreResult=false] if true, will return null rather than tracking result
   * @returns {Future|Future[]}
   */
  apply: function(method, args, kwargs, trackStarted, ignoreResult){
    return this.createTask(method, {}, trackStarted, ignoreResult).apply(args, kwargs);
  }

});

function CeleryTask(client, name, options, additionalOptions){
  var self = this;

  self.name = name;
  self._client = client;
  self._task = client._client.createTask(name, options, additionalOptions);
}

_.extend(CeleryTask.prototype, {
  call: function(){
    return this.apply(Array.prototype.slice(arguments, 0));
  },
  apply: function(args, kwargs, options){
    var self = this,
        result = new Future(),
        started, celery_result;

    // provide a separate `Future` if `trackStarted` is provided
    if (!!self._task.additionalOptions.track_started && !self._task.additionalOptions.ignore_result){
      started = new Future();
    }

    // check that the client is currently connected.
    if (!self._client._connected){
      // causes both `started` & `result` to throw
      started && result.proxy(started);

      result.throw(new Error(debug_call_stmt(self._client._name, self._task.name, null, "Call failed. Celery isn't connected")));
    } else {
      // call the method on the actual `client`
      celery_result = self._task.call(args, kwargs, options);

      if (self._task.additionalOptions.ignore_result || celery_result == null){
        return;
      }

      debug_call(self._client._name, self._task.name, celery_result.taskid, 'called');

      // register event handlers for failure
      celery_result.on('failure', CeleryTask_call_onError);
      celery_result.on('revoked', CeleryTask_call_onError);
      celery_result.on('rejected', CeleryTask_call_onError);
      celery_result.on('ignored', CeleryTask_call_onError);

      // register event handler for `started`
      started && celery_result.on('started', CeleryTask_call_onStarted);

      // register event handler for `success`
      celery_result.on('success', CeleryTask_call_onSuccess);
    }

    if (started){
      return [started, result];
    } else {
      return result;
    }

    function CeleryTask_call_onError(message){
      debug_call(self._client._name, self._task.name, celery_result.taskid, "Call failed [" + message.status + "]", message.traceback);
      // only propagate the error to `started` if it hasn't resolved.
      if (started && !started.isResolved()){
        result.proxy(started);
      }

      result.throw(new Error(debug_call_stmt(self._client._name, self._task.name, null, "Call failed [" + message.status + "]")));
    }

    function CeleryTask_call_onStarted(){
      debug_call(self._client._name, self._task.name, celery_result.taskid, "Started");
      if (started.isResolved()) return;
      started.return(true);
    }

    function CeleryTask_call_onSuccess(message){
      // if `started` wasn't resolved -
      if (started && !started.isResolved()){
        debug_call(self._client._name, self._task.name, celery_result.taskid, "Started (Warning: `started` was event forced)");
        started.return(true);
      }
      debug_call(self._client._name, self._task.name, celery_result.taskid, "Success", message.result);
      result.return(message.result)
    }
  }
});
// debug code
var debug = function(){};
var debug_client = function(client_name, message){};
var debug_call = function(client_name, method_name, task_id, message){};
var debug_call_stmt = function(client_name, method_name, task_id, message){
  return 'CeleryClient[' + client_name +  ']#call(' + JSON.stringify(method_name) + ')[task_id:' + JSON.stringify(task_id) +'] - ' + message
};

if (!!process.env['METEOR_CELERY_DEBUG']){
  debug = function(){
    console.log.apply(console, arguments);
  };
  debug_client = function(client_name, message){
    var log_message = 'CeleryClient[' + client_name +  '] - ' + message,
      args = [].slice.call(arguments, 2);
    args.unshift(log_message);
    console.log.apply(console, args);
  };
  debug_call = function(client_name, method_name, task_id, message){
    var log_message = debug_call_stmt(client_name, method_name, task_id, message),
      args = [].slice.call(arguments, 4);
    args.unshift(log_message);
    console.log.apply(console, args);
  };
}
