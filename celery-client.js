var celery = Npm.require('celery-shoot');
var Future = Npm.require('fibers/future');


/**
 * Creates a new `CeleryClient` and stores it in `CeleryClients`
 * @param name
 * @constructor
 */
CeleryClient = function (name){
  this._name = name;
  this._connected = false;
  this._error = false;
};

_.extend(CeleryClient.prototype, {
  /**
   * Connects asynchronously, proxies `conf` through to celery.createClient
   *
   * @param {Object} conf
   * @param {String} [conf.BROKER_URL='amqp://']
   * @param {String} [conf.RESULT_BACKEND]
   * @param {String} [conf.DEFAULT_QUEUE='celery']
   * @param {String} [conf.QUEUES=['celery']]
   * @param {String} [conf.DEFAULT_EXCHANGE_TYPE='direct']
   * @param {String} [conf.RESULT_EXCHANGE='celeryresults']
   * @param {String} [conf.EVENT_EXCHANGE='celeryev']
   * @param {Boolean} [conf.SEND_TASK_SENT_EVENT=false]
   * @param {Number} [conf.TASK_RESULT_EXPIRES=86400000]
   * @param {Object} [conf.ROUTES={}]
   *
   * @returns {Boolean}
   */
  connect: function(conf){
    var self = this;

    if (self._client != null){
      throw new Error("Already connected");
    }

    self._client = celery.createClient(conf);

    self._client.on('connect', function CeleryClient_connect(){
      debug_client(self._name, 'connected');
      self._connected = true;
      self._error = false;
    });

    self._client.on('error', function CeleryClient_error(err){
      debug_client(self._name, 'connection error', err, err && err.stack);
      self._error = true;
    });

    self._client.on('end', function CeleryClient_end(){
      debug_client(self._name, 'connection closed');
      self._connected = false;
      if (!self._error) {
        // dirty trick to force reconnect
        // if you cleanly shut down rabbitMQ - it wont reconnect {as there wasn't an error}
        debug_client(self._name, 'emitting error to force reconnection');
        self._client.broker.emit('error')
      }
    });
  },

  createTask: function(name, options, trackStarted, ignoreResult){
    return new CeleryTask(this, name, options, {
      trackStarted: trackStarted,
      ignoreResult: ignoreResult
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
  apply: function(args, kwargs){
    var self = this,
        result = new Future(),
        started, celery_result;

    // provide a separate `Future` if `trackStarted` is provided
    if (!!self._task.additionalOptions.trackStarted && !self._task.additionalOptions.ignoreResult){
      started = new Future();
    }

    // check that the client is currently connected.
    if (!self._client._connected){
      // causes both `started` & `result` to throw
      started && result.proxy(started);

      result.throw(new Error(debug_call_stmt(self._client._name, self._task.name, null, "Call failed. Celery isn't connected")));
    } else {
      // call the method on the actual `client`
      celery_result = self._task.call(args, kwargs);

      if (self._task.additionalOptions.ignoreResult || celery_result == null){
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
