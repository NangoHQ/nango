import { expect } from 'vitest';

const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(.\d{1,6})?Z$/;
const dateRegexWithTZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(.\d{1,6})?\+\d{2}:\d{2}$/;
const uuidRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;
const sha256Regex = /^[a-f0-9]{64}$/;

expect.extend({
    toBeIsoDate: (received: any) => {
        if (received instanceof Date) {
            return { pass: true, message: () => '' };
        } else if (typeof received === 'string' && dateRegex.test(received)) {
            return { pass: true, message: () => '' };
        }

        return {
            message: () => `expected ${received} to be an ISO Date`,
            pass: false
        };
    },

    toBeIsoDateTimezone: (received: any) => {
        if (received instanceof Date) {
            return { pass: true, message: () => '' };
        } else if (typeof received === 'string' && dateRegexWithTZ.test(received)) {
            return { pass: true, message: () => '' };
        }

        return {
            message: () => `expected ${received} to be an ISO Date`,
            pass: false
        };
    },

    toBeUUID: (received: any) => {
        if (!uuidRegex.test(received)) {
            return {
                message: () => `expected ${received} to be a UUID v4`,
                pass: false
            };
        }
        return { pass: true, message: () => '' };
    },

    toBeSha256: (received: any) => {
        if (!sha256Regex.test(received)) {
            return {
                message: () => `expected ${received} to be a valid SHA-256 hash`,
                pass: false
            };
        }
        return { pass: true, message: () => '' };
    }
});
