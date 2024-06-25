import { vi } from 'vitest';
import * as ActivityService from './activity.service.js';

export function mockCreateActivityLog() {
    return vi.spyOn(ActivityService, 'createActivityLog').mockImplementation(() => {
        return Promise.resolve(1);
    });
}
