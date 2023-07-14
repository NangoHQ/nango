import { vi } from 'vitest';
import * as ActivityService from './activity.service.js';

export function mockCreateActivityLog() {
    return vi.spyOn(ActivityService, 'createActivityLog').mockImplementation(() => {
        return Promise.resolve(1);
    });
}

export function mockCreateActivityLogMessage() {
    return vi.spyOn(ActivityService, 'createActivityLogMessage').mockImplementation(() => {
        return Promise.resolve(true);
    });
}
