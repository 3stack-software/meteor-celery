Package.describe({
  summary: 'Integrates celery distributed task system in to meteor.'
});

Package.on_use(function (api) {
  api.export('Celery');
  Npm.depends({"node-celery": 'https://github.com/nathan-muir/node-celery/tarball/b7309ae1b0b556312b28d8e769ed04cd37a768e7'});
  api.add_files(['server.js'],'server');
});
