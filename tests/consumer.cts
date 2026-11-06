import { createIdleMaintenance } from '@lp-labs/idle-maintenance';

const scheduler = {
  schedule(callback: () => void): ReturnType<typeof setTimeout> {
    return setTimeout(callback, 0);
  },
  cancel(handle: ReturnType<typeof setTimeout>): void {
    clearTimeout(handle);
  },
};
createIdleMaintenance({ scheduler, maxQueue: 8 }).dispose();
