export interface MaintenanceScheduler<Handle = unknown> {
  schedule(callback: () => void): Handle;
  cancel(handle: Handle): void;
}

export interface IdleMaintenanceOptions<Handle> {
  readonly scheduler: MaintenanceScheduler<Handle>;
  readonly maxQueue?: number;
  readonly onError?: (error: unknown) => void;
}

export interface IdleMaintenanceQueue {
  readonly size: number;
  readonly disposed: boolean;
  enqueue(task: () => void): number;
  cancel(id: number): boolean;
  dispose(): void;
}

interface Entry {
  readonly id: number;
  readonly task: () => void;
}

const DEFAULT_MAX_QUEUE = 256;
const MAX_QUEUE_LIMIT = 100_000;

/** Runs bounded synchronous maintenance tasks through a caller-provided scheduler. */
export function createIdleMaintenance<Handle = unknown>(
  options: IdleMaintenanceOptions<Handle>,
): IdleMaintenanceQueue {
  if (
    typeof options !== 'object' ||
    options === null ||
    typeof options.scheduler?.schedule !== 'function' ||
    typeof options.scheduler.cancel !== 'function'
  ) {
    throw new TypeError('An injectable scheduler with schedule and cancel methods is required');
  }
  const maxQueue = options.maxQueue ?? DEFAULT_MAX_QUEUE;
  if (!Number.isSafeInteger(maxQueue) || maxQueue < 1 || maxQueue > MAX_QUEUE_LIMIT) {
    throw new RangeError(`maxQueue must be between 1 and ${MAX_QUEUE_LIMIT}`);
  }
  if (options.onError !== undefined && typeof options.onError !== 'function') {
    throw new TypeError('onError must be a function');
  }

  let nextId = 1;
  let scheduled: Handle | undefined;
  let hasScheduled = false;
  let disposed = false;
  const queue: Entry[] = [];

  const pump = (): void => {
    hasScheduled = false;
    scheduled = undefined;
    const entry = queue.shift();
    if (!entry || disposed) return;
    try {
      entry.task();
    } catch (error) {
      try {
        options.onError?.(error);
      } catch {
        // A reporting hook must not stall unrelated queued maintenance.
      }
    }
    if (queue.length > 0) {
      try {
        schedule();
      } catch (error) {
        try {
          options.onError?.(error);
        } catch {
          // Leave remaining work queued so a later enqueue can retry scheduling.
        }
      }
    }
  };

  const schedule = (): void => {
    if (disposed || hasScheduled || queue.length === 0) return;
    hasScheduled = true;
    try {
      scheduled = options.scheduler.schedule(pump);
    } catch (error) {
      hasScheduled = false;
      scheduled = undefined;
      throw error;
    }
  };

  return {
    get size() {
      return queue.length;
    },
    get disposed() {
      return disposed;
    },
    enqueue(task) {
      if (disposed) throw new Error('Maintenance queue has been disposed');
      if (typeof task !== 'function') throw new TypeError('task must be a function');
      if (queue.length >= maxQueue) throw new RangeError('Maintenance queue is at capacity');
      if (!Number.isSafeInteger(nextId))
        throw new RangeError('Maintenance task ID space exhausted');
      const id = nextId++;
      queue.push({ id, task });
      try {
        schedule();
      } catch (error) {
        queue.pop();
        throw error;
      }
      return id;
    },
    cancel(id) {
      const index = queue.findIndex((entry) => entry.id === id);
      if (index < 0) return false;
      queue.splice(index, 1);
      if (queue.length === 0 && hasScheduled) {
        options.scheduler.cancel(scheduled as Handle);
        hasScheduled = false;
        scheduled = undefined;
      }
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      queue.length = 0;
      if (hasScheduled) options.scheduler.cancel(scheduled as Handle);
      hasScheduled = false;
      scheduled = undefined;
    },
  };
}
