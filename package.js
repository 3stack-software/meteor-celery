Package.describe({
  summary: 'Integrates celery distributed task system in to meteor.'
});

Package.on_use(function (api) {
  api.use('underscore', 'server');
  api.export('CeleryClient', 'server');
  api.export('CeleryClients', 'server');
  Npm.depends({"celery-shoot": '2.0.1'});
  api.add_files(['server.js'],'server');
});
