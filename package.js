Package.describe({
  name: '3stack:celery',
  version: '1.0.1',
  summary: 'Connect Meteor to a python task server - a celery interface based on fibers/future',
  git: 'https://github.com/3stack-software/meteor-celery',
  documentation: 'README.md'
});

Package.on_use(function (api) {
  api.versionsFrom('METEOR@0.9.2');

  api.use('underscore', 'server');
  api.export('CeleryClient', 'server');
  api.export('CeleryClients', 'server');
  Npm.depends({"celery-shoot": '2.0.2'});
  api.add_files(['celery-client.js'],'server');
});
