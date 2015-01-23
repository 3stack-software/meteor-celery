
# Meteor Celery

This package now uses `celery-shoot` - a fork of `node-celery`, and v0.2.0 of the node-amqp driver.


# Installing

We're now in atmosphere!

To install, simply:
```sh
cd /to/your/meteor/project
meteor add 3stack:celery
```

You can also install by cloning this repository to your packages folder

```sh
cd /to/my/meteor/project
git clone --depth 1 https://github.com/3stack-software/meteor-celery.git packages/celery
rm -rf packages/celery/.git
```

# Usage

If you'd like to connect to a single Celery server based on environment variables, check out

https://github.com/3stack-software/meteor-celery-connect

otherwise-

Create a file to connect to your amqp server
Example `server/celery_connect.js`:

```js
Meteor.startup(function(){
  // Creates a new client 'meteor` and stores it in `CeleryClients['meteor']`
  var client = new CeleryClient('meteor');
  client.connect({
    "BROKER_URL": "amqp://guest@localhost:5672//",
    "RESULT_BACKEND": "amqp",
    "SEND_TASK_SENT_EVENT": true
  })
});
```

Call your celery tasks from meteor (including meteor methods):

```js
var Future = Npm.require('fibers/future');

Meteor.methods({
  "performSomeHeavyTask": function(someArg){
    check(someArg, String);
    this.unblock(); // if called with Meteor.apply('performSomeHeavyTask',[someArg],{wait:false}) this will prevent blocking of other method calls
    // CeleryClient#call returns a Future - call `.wait()` to obtain the result
    return CeleryClients.meteor.call('heavyTask', [1, 2, 3, someArg]).wait();
  },
  "performLotsOfTasks": function(someArgs){
    check(someArg, [String]);
    var futures = _.map(someArgs, function(someArg){
      // call the methods simultaneously
      return CeleryClients.meteor.call('heavyTask', [1, 2, 3, someArg]);
    });

    // wait for them as a group
    Future.wait(futures);

    // return the results as an array
    return _.map(futures, function(f) { return f.get() });
  }
});
```

You can also track long-running tasks - using [Task.track_started](http://docs.celeryproject.org/en/latest/userguide/tasks.html#Task.track_started)

```js
Meteor.methods({
  "performLongRunningTask": function(){
    // CeleryClient#call returns a Future - call `.wait()` to obtain the result
    Meteor.defer(function(){
      // provide `trackStarted=true` to `CeleryClient#call`, and you'll have two futures to check
      var futures = CeleryClients.meteor.call('heavyTask', [1, 2, 3, someArg], true),
        started = futures[0],
        completed = futures[1],
        result;

      console.log('Waiting for task to be started by a worker');
      started.wait();
      console.log('Task Started, waiting for completion');
      result = completed.wait();
      console.log('Task completed', result);
    });
    console.log('Queued task, returning method');
    return true;
  }
});

```

Debugging

```sh
# just debug meteor-celery
METEOR_CELERY_DEBUG=1 meteor
# debug meteor-celery, and celery-shoot
METEOR_CELERY_DEBUG=1 NODE_CELERY_DEBUG=1 meteor
# debug meteor-celery, celery-shoot and node-amqp
METEOR_CELERY_DEBUG=1 NODE_CELERY_DEBUG=1 NODE_DEBUG_AMQP=1 meteor
```
