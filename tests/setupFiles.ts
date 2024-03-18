import { expect } from 'vitest';

const dateReg = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
const uuidReg = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;

expect.extend({
    toBeIsoDate: (received: any) => {
        if (received instanceof Date) {
            return { pass: true, message: () => '' };
        } else if (typeof received === 'string' && dateReg.test(received)) {
            return { pass: true, message: () => '' };
        }

        return {
            message: () => `expected ${received} to be an ISO Date`,
            pass: false
        };
    },

    toBeUUID: (received: any) => {
        if (!uuidReg.test(received)) {
            return {
                message: () => `expected ${received} to be a UUID v4`,
                pass: false
            };
        }
        return { pass: true, message: () => '' };
    }
});
