import { vi } from 'vitest';
import environmentService from '../services/environment.service.js';
import userService from '../services/user.service.js';

export function mockErrorManagerReport() {
    vi.spyOn(environmentService, 'getEnvironmentName').mockImplementation(() => {
        return Promise.resolve('dev');
    });

    vi.spyOn(environmentService, 'getAccountIdFromEnvironment').mockImplementation(() => {
        return Promise.resolve(1);
    });

    vi.spyOn(userService, 'getUsersByAccountId').mockImplementation(() => {
        return Promise.resolve([]);
    });
}
