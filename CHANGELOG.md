
## v2.0.0

 * Updated to v3 of `celery-shoot` ;
    Instead of `DEFAULT_ROUTING_KEY`/ `DEFAULT_EXCHANGE` - simply provide a list of queue names to connect (via `QUEUES` option)
    Then, provide `options.queue` to `CeleryClient.createTask`, or setup `ROUTES` (A mapping of Task Name=> Queue)

 * `Task.call` / `Task.apply` no longer takes `options` parameter - must provide to `CeleryClient.createTask`
 * `CeleryClient.connect` is no longer synchronous; it also forces reconnect better.
