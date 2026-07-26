import { describe, expect, it } from 'vitest';

import { buildWebsocketsPath } from './nango.js';

describe('buildWebsocketsPath', () => {
    it('defaults to the root path on a bare-origin apiURL', () => {
        expect(buildWebsocketsPath('https://api.nango.dev')).toBe('/');
    });

    it('preserves a base path configured in apiURL', () => {
        expect(buildWebsocketsPath('https://example.com/base/path')).toBe('/base/path/');
    });

    it('ignores a trailing slash in apiURL', () => {
        expect(buildWebsocketsPath('https://example.com/base/path/')).toBe('/base/path/');
    });

    it('appends a custom server websockets path to the apiURL base path', () => {
        expect(buildWebsocketsPath('https://example.com/base/path', '/ws')).toBe('/base/path/ws');
    });

    it('applies a custom server websockets path on a bare-origin apiURL', () => {
        expect(buildWebsocketsPath('https://api.nango.dev', '/ws')).toBe('/ws');
    });

    it('treats the default server path "/" like an unset value', () => {
        expect(buildWebsocketsPath('https://example.com/base/path', '/')).toBe('/base/path/');
    });

    it('normalizes a server path missing its leading slash', () => {
        expect(buildWebsocketsPath('https://example.com/base/path', 'ws')).toBe('/base/path/ws');
    });
});
