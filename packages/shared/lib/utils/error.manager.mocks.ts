import { vi } from 'vitest';
import environmentService from '../services/environment.service';
import userService from '../services/user.service';

export function mockErrorManagerReport() {
    vi.spyOn(environmentService, 'getEnvironmentName').mockImplementation(() => {
        return Promise.resolve('dev');
    });

    vi.spyOn(environmentService, 'getAccountIdFromEnvironment').mockImplementation(() => {
        return Promise.resolve(1);
    });

    vi.spyOn(userService, 'getByAccountId').mockImplementation(() => {
        return Promise.resolve([]);
    });

    vi.spyOn(userService, 'getUsersByAccountId').mockImplementation(() => {
        return Promise.resolve([]);
    });
}
