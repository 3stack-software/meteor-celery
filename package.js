Package.describe({
  name: '3stack:celery',
  version: '2.0.0',
  summary: 'Connect Meteor to a python task server - a celery interface based on fibers/future',
  git: 'https://github.com/3stack-software/meteor-celery',
  documentation: 'README.md'
});

Npm.depends({
  "celery-shoot": 'https://github.com/3stack-software/celery-shoot/tarball/dd0bd6eec49d08a4dcf7e2b235c2b1b439976982'
});

Package.onUse(function (api) {
  api.versionsFrom('METEOR@1.1.0.2');

  api.use('underscore', 'server');
  api.export('CeleryClient', 'server');
  api.addFiles(['celery-client.js'],'server');
});
