# @lp-labs/idle-maintenance

A small bounded queue for synchronous maintenance callbacks, paced exclusively by a caller-injected
scheduler. It assumes no browser idle APIs or particular scheduling environment.

## Install

```bash
npm install @lp-labs/idle-maintenance
```

ES2022 ESM and CommonJS builds include TypeScript declarations.

## Quickstart

```js
import { createIdleMaintenance } from '@lp-labs/idle-maintenance';

const scheduler = {
  schedule(callback) {
    return setTimeout(callback, 0);
  },
  cancel(handle) {
    clearTimeout(handle);
  },
};
const maintenance = createIdleMaintenance({ scheduler });
maintenance.enqueue(() => console.log('compact an in-memory cache'));
```

## API and customization

`createIdleMaintenance({ scheduler, maxQueue?, onError? })` accepts an adapter with
`schedule(callback)` and `cancel(handle)` methods. The adapter owns timing and handle semantics.
The default queue capacity is 256 callbacks; `maxQueue` may be 1–100,000.

The returned queue exposes `enqueue(task)` (returns a numeric task ID), `cancel(id)`, `size`,
`disposed`, and `dispose()`. One callback runs per scheduler invocation in FIFO order. Cancellation
only removes queued work; it does not interrupt an executing callback. A thrown task error is sent
to `onError` if provided, then the queue continues. Without `onError`, the error is contained.

## Limits and scope

Tasks are synchronous and must return promptly. Queue length is bounded; IDs increase within the
queue lifetime. Scheduling failures are surfaced to `enqueue` or the current scheduled callback.
Provide an asynchronous scheduler if callbacks must not run inline; no global or browser scheduler
is selected by the library. Disposing cancels pending scheduled work and drops queued tasks, but
cannot undo a callback that has already started. This is in-memory coordination, not durable work
management, a priority queue, or a deadline/budget guarantee.

## Exports

Runtime export: `createIdleMaintenance`.
TypeScript-only exports: `MaintenanceScheduler`, `IdleMaintenanceOptions`, `IdleMaintenanceQueue`.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
