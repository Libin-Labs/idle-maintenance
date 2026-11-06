import { createIdleMaintenance, type MaintenanceScheduler } from '@lp-labs/idle-maintenance';

const scheduler: MaintenanceScheduler<number> = {
  schedule(callback) {
    return setTimeout(callback, 0) as unknown as number;
  },
  cancel(handle) {
    clearTimeout(handle);
  },
};
createIdleMaintenance({ scheduler }).enqueue(() => {});
