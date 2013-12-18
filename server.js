var celery = Npm.require('node-celery');
var Future = Npm.require('fibers/future');

if (!(Meteor && Meteor.settings && Meteor.settings.celery)){
  throw new Error('No Celery Configuration');
}
client = celery.createClient(Meteor.settings.celery);

var connected = false;
client.on('connect', function(){
  connected = true;
});
client.on('error', function(err){
  console.log(err);
});
client.on('end', function(){
  console.log('celery disconnected!');
  connected = false;
});

Celery = {};
Celery.call = function(method, args){
  if (!connected){
    throw new Error("Celery not connected");
  }
  var result = client.call(method, args);
  var onError = function(message){
    result.emit('error', message)
  };
  result.on('failure', onError);
  result.on('revoked', onError);
  result.on('rejected', onError);
  result.on('ignored', onError);

  return result;
};
