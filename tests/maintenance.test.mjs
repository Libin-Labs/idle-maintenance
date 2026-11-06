import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createIdleMaintenance } from '../dist/esm/index.js';

function makeScheduler() {
  let next = 0;
  const callbacks = new Map();
  return {
    callbacks,
    scheduler: {
      schedule(callback) {
        const id = ++next;
        callbacks.set(id, callback);
        return id;
      },
      cancel(id) {
        callbacks.delete(id);
      },
    },
    runNext() {
      const entry = callbacks.entries().next().value;
      if (!entry) return false;
      const [id, callback] = entry;
      callbacks.delete(id);
      callback();
      return true;
    },
  };
}

test('runs queued tasks one per injected scheduler callback in FIFO order', () => {
  const clock = makeScheduler();
  const queue = createIdleMaintenance({ scheduler: clock.scheduler });
  const output = [];
  queue.enqueue(() => output.push(1));
  queue.enqueue(() => output.push(2));
  assert.deepEqual(output, []);
  clock.runNext();
  assert.deepEqual(output, [1]);
  clock.runNext();
  assert.deepEqual(output, [1, 2]);
  assert.equal(queue.size, 0);
});

test('enforces a finite pending queue limit and accepts a task after a slot frees', () => {
  const clock = makeScheduler();
  const queue = createIdleMaintenance({ scheduler: clock.scheduler, maxQueue: 1 });
  queue.enqueue(() => {});
  assert.throws(() => queue.enqueue(() => {}), /capacity/);
  clock.runNext();
  assert.doesNotThrow(() => queue.enqueue(() => {}));
});

test('cancels pending work by ID and reports missing or active IDs', () => {
  const clock = makeScheduler();
  const queue = createIdleMaintenance({ scheduler: clock.scheduler });
  const observed = [];
  const first = queue.enqueue(() => observed.push('first'));
  const second = queue.enqueue(() => observed.push('second'));
  assert.equal(queue.cancel(second), true);
  assert.equal(queue.cancel(second), false);
  clock.runNext();
  assert.deepEqual(observed, ['first']);
  assert.equal(queue.cancel(first), false);
});

test('cancelling the last queued item cancels its scheduled callback', () => {
  const clock = makeScheduler();
  const queue = createIdleMaintenance({ scheduler: clock.scheduler });
  const id = queue.enqueue(() => assert.fail('cancelled callback ran'));
  assert.equal(queue.cancel(id), true);
  assert.equal(clock.callbacks.size, 0);
  assert.equal(queue.size, 0);
});

test('disposal drops queued work, cancels scheduler handle, and is idempotent', () => {
  const clock = makeScheduler();
  const queue = createIdleMaintenance({ scheduler: clock.scheduler });
  queue.enqueue(() => assert.fail('disposed callback ran'));
  queue.dispose();
  queue.dispose();
  assert.equal(queue.disposed, true);
  assert.equal(queue.size, 0);
  assert.equal(clock.callbacks.size, 0);
  assert.throws(() => queue.enqueue(() => {}), /disposed/);
});

test('reports task errors and continues draining', () => {
  const clock = makeScheduler();
  const errors = [];
  const queue = createIdleMaintenance({
    scheduler: clock.scheduler,
    onError: (error) => errors.push(error),
  });
  let completed = false;
  queue.enqueue(() => {
    throw new Error('maintenance failed');
  });
  queue.enqueue(() => {
    completed = true;
  });
  clock.runNext();
  clock.runNext();
  assert.equal(errors[0].message, 'maintenance failed');
  assert.equal(completed, true);
});

test('contains task failures when no error callback is configured', () => {
  const clock = makeScheduler();
  const queue = createIdleMaintenance({ scheduler: clock.scheduler });
  queue.enqueue(() => {
    throw new Error('ignored');
  });
  queue.enqueue(() => {});
  assert.doesNotThrow(() => clock.runNext());
  assert.doesNotThrow(() => clock.runNext());
});

test('rejects invalid scheduler, capacity, and task inputs', () => {
  assert.throws(() => createIdleMaintenance({ scheduler: {} }), /scheduler/);
  const clock = makeScheduler();
  for (const maxQueue of [0, -1, 1.1, 100_001]) {
    assert.throws(
      () => createIdleMaintenance({ scheduler: clock.scheduler, maxQueue }),
      /maxQueue/,
    );
  }
  const queue = createIdleMaintenance({ scheduler: clock.scheduler });
  assert.throws(() => queue.enqueue(null), /task/);
});

test('rolls back enqueue when scheduler setup fails', () => {
  const queue = createIdleMaintenance({
    scheduler: {
      schedule() {
        throw new Error('scheduler unavailable');
      },
      cancel() {},
    },
  });
  assert.throws(() => queue.enqueue(() => {}), /scheduler unavailable/);
  assert.equal(queue.size, 0);
});

test('a throwing error handler does not prevent later maintenance', () => {
  const clock = makeScheduler();
  const queue = createIdleMaintenance({
    scheduler: clock.scheduler,
    onError() {
      throw new Error('reporter failed');
    },
  });
  let completed = false;
  queue.enqueue(() => {
    throw new Error('task failed');
  });
  queue.enqueue(() => {
    completed = true;
  });
  assert.doesNotThrow(() => clock.runNext());
  assert.doesNotThrow(() => clock.runNext());
  assert.equal(completed, true);
});

test('CommonJS creates and disposes an independent queue', () => {
  const api = createRequire(import.meta.url)('@lp-labs/idle-maintenance');
  const clock = makeScheduler();
  const queue = api.createIdleMaintenance({ scheduler: clock.scheduler });
  queue.enqueue(() => {});
  queue.dispose();
  assert.equal(queue.size, 0);
});
