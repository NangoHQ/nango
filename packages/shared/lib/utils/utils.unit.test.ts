import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as utils from './utils.js';

import type { Provider } from '@nangohq/types';

describe('Proxy service Construct Header Tests', () => {
    it('Should correctly return true if the url is valid', () => {
        const isValid = utils.isValidHttpUrl('https://www.google.com');

        expect(isValid).toBe(true);

        expect(utils.isValidHttpUrl('https://samcarthelp.freshdesk.com/api/v2/tickets?per_page=100&include=requester,description&page=3')).toBe(true);

        expect(utils.isValidHttpUrl('/api/v2/tickets?per_page=100&include=requester,description&page=3')).toBe(false);
    });
});
describe('encodeParameters Function Tests', () => {
    it('should encode parameters correctly', () => {
        const params = {
            redirectUri: 'https://redirectme.com'
        };

        const expected = {
            redirectUri: 'https%3A%2F%2Fredirectme.com'
        };

        expect(utils.encodeParameters(params)).toEqual(expected);
    });

    it('should handle parameters with special characters', () => {
        const params = {
            redirectUri: 'https://redirectme.com?param=value&another=value'
        };

        const expected = {
            redirectUri: 'https%3A%2F%2Fredirectme.com%3Fparam%3Dvalue%26another%3Dvalue'
        };

        expect(utils.encodeParameters(params)).toEqual(expected);
    });
});

describe('interpolateIfNeeded', () => {
    it('should interpolate both parts when "||" is present', () => {
        const input = '${connectionConfig.appDetails} || ${connectionConfig.userEmail}';
        const result = utils.interpolateIfNeeded(input, {
            connectionConfig: {
                appDetails: 'MyAppDetails',
                userEmail: 'unknown@example.com'
            }
        });
        expect(result).toBe('MyAppDetails');
    });

    it('should use the fallback if the first part is empty', () => {
        const input = '${connectionConfig.appDetails} || ${connectionConfig.userEmail}';
        const result = utils.interpolateIfNeeded(input, {
            connectionConfig: {
                appDetails: '',
                userEmail: 'fallback@example.com'
            }
        });
        expect(result).toBe('fallback@example.com');
    });

    it('should return the fallback value when the first part cannot be interpolated', () => {
        const input = '${connectionConfig.version} || 2022-11-28';
        const result = utils.interpolateIfNeeded(input, {
            connectionConfig: {}
        });
        expect(result).toBe('2022-11-28');
    });

    it('should return only the first part if "||" is not present', () => {
        const input = '${connectionConfig.appDetails}';
        const result = utils.interpolateIfNeeded(input, {
            connectionConfig: {
                appDetails: 'MyAppDetails'
            }
        });
        expect(result).toBe('MyAppDetails');
    });
});

it('Should extract metadata from token response based on provider', () => {
    const provider: Provider = {
        display_name: 'test',
        docs: '',
        auth_mode: 'OAUTH2',
        token_response_metadata: ['incoming_webhook.url', 'ok', 'bot_user_id', 'scope']
    };

    const params = {
        ok: true,
        scope: 'chat:write,channels:read,team.billing:read,users:read,channels:history,channels:join,incoming-webhook',
        token_type: 'bot',
        bot_user_id: 'abcd',
        enterprise: null,
        is_enterprise_install: false,
        incoming_webhook: {
            channel_id: 'foo',
            configuration_url: 'https://nangohq.slack.com',
            url: 'https://hooks.slack.com'
        }
    };

    const result = utils.getConnectionMetadata(params, provider, 'token_response_metadata');
    expect(result).toEqual({
        'incoming_webhook.url': 'https://hooks.slack.com',
        ok: true,
        bot_user_id: 'abcd',
        scope: 'chat:write,channels:read,team.billing:read,users:read,channels:history,channels:join,incoming-webhook'
    });
});

it('Should extract metadata from token response based on template and if it does not exist not fail', () => {
    const provider: Provider = {
        display_name: 'test',
        docs: '',
        auth_mode: 'OAUTH2',
        token_response_metadata: ['incoming_webhook.url', 'ok']
    };

    const params = {
        scope: 'chat:write,channels:read,team.billing:read,users:read,channels:history,channels:join,incoming-webhook',
        token_type: 'bot',
        enterprise: null,
        is_enterprise_install: false,
        incoming_webhook: {
            configuration_url: 'foo.bar'
        }
    };

    const result = utils.getConnectionMetadata(params, provider, 'token_response_metadata');
    expect(result).toEqual({});
});

it('Should not extract metadata from an empty token response', () => {
    const provider: Provider = {
        display_name: 'test',
        docs: '',
        auth_mode: 'OAUTH2',
        token_response_metadata: ['incoming_webhook.url', 'ok']
    };

    const params = {};

    const result = utils.getConnectionMetadata(params, provider, 'token_response_metadata');
    expect(result).toEqual({});
});

describe('interpolateString', () => {
    const replacers = {
        username: 'john',
        password: 'doe123',
        apiKey: 'ABC123'
    };

    it('should interpolate simple variables', () => {
        const input = 'Hello ${username}, your password is ${password}';
        const output = utils.interpolateString(input, replacers);
        expect(output).toBe('Hello john, your password is doe123');
    });

    it('should interpolate ${now} with current timestamp', () => {
        const input = 'Current time: ${now}';
        const output = utils.interpolateString(input, replacers);
        expect(output).toMatch(/^Current time: \d{4}-\d{2}-\d{2}T/);
    });

    it('should interpolate ${now} with exact ISO string when using fake timers', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-02T14:30:55.000Z'));
        const input = 'Current time: ${now}';
        const output = utils.interpolateString(input, replacers);
        expect(output).toBe('Current time: 2026-03-02T14:30:55.000Z');
        vi.useRealTimers();
    });

    it('should interpolate ${now:YYYY-MM-DDTHH:mm:ss} with formatted date (exact)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-02T14:30:55.000Z'));
        const input = 'Timestamp: ${now:YYYY-MM-DDTHH:mm:ss}';
        const output = utils.interpolateString(input, replacers);
        expect(output).toBe('Timestamp: 2026-03-02T14:30:55');
        vi.useRealTimers();
    });

    it('should resolve values inside base64 properly', () => {
        const input = '${base64(${username}:${password})}';
        const output = utils.interpolateString(input, replacers);
        const expected = Buffer.from('john:doe123').toString('base64');
        expect(output).toBe(expected);
    });
    it('should resolve nested keys', () => {
        const nestedReplacers = {
            installation: {
                uuid: 'abc-123-xyz'
            }
        };

        const input = 'Installation ID: ${installation.uuid}';
        const output = utils.interpolateString(input, nestedReplacers);
        expect(output).toBe('Installation ID: abc-123-xyz');
    });

    it('should interpolate ${sha256Hex(inner)} with hex digest of resolved inner string', () => {
        const input = 'Hash: ${sha256Hex(hello)}';
        const output = utils.interpolateString(input, {});
        const expected = crypto.createHash('sha256').update('hello', 'utf8').digest('hex');
        expect(output).toBe(`Hash: ${expected}`);
    });

    it('should interpolate ${sha256Hex(inner)} with replacers inside inner', () => {
        const input = 'Hash: ${sha256Hex(${username})}';
        const output = utils.interpolateString(input, replacers);
        const expected = crypto.createHash('sha256').update('john', 'utf8').digest('hex');
        expect(output).toBe(`Hash: ${expected}`);
    });

    it('should interpolate base64 nested inside sha256Hex', () => {
        const input = 'Hash: ${sha256Hex(${base64(${username}:${password})})}';
        const output = utils.interpolateString(input, replacers);
        const base64Value = Buffer.from('john:doe123').toString('base64');
        const expected = crypto.createHash('sha256').update(base64Value, 'utf8').digest('hex');
        expect(output).toBe(`Hash: ${expected}`);
    });

    it('should interpolate ${random} with replacer when provided', () => {
        const stableRandom = 'fixed-uuid-12345';
        const input = 'Id: ${random}';
        const output = utils.interpolateString(input, { random: stableRandom });
        expect(output).toBe('Id: fixed-uuid-12345');
    });

    it('should interpolate ${now} with replacer when provided', () => {
        const stableNow = '2026-03-02T12:00:00.000Z';
        const input = 'Time: ${now}';
        const output = utils.interpolateString(input, { now: stableNow });
        expect(output).toBe('Time: 2026-03-02T12:00:00.000Z');
    });

    it('should interpolate ${now:YYYY-MM-DD} with replacer when provided', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-02T14:30:55.000Z'));
        const input = 'Date: ${now:YYYY-MM-DD}';
        const output = utils.interpolateString(input, { now: '2026-03-02T14:30:55.000Z' });
        expect(output).toBe('Date: 2026-03-02');
        vi.useRealTimers();
    });
});

describe('interpolateStringFromObject', () => {
    const context = {
        name: 'Alice',
        age: 30,
        credentials: {
            username: 'user123',
            password: 'pass456',
            apiKey: 'XYZ-987'
        },
        token: 'abc.def.ghi'
    };

    it('replaces simple placeholders', () => {
        const input = 'Hello ${name}, you are ${age} years old.';
        const output = utils.interpolateStringFromObject(input, context);
        expect(output).toBe('Hello Alice, you are 30 years old.');
    });

    it('replaces nested object keys', () => {
        const input = 'User: ${credentials.username}, Pass: ${credentials.password}';
        const output = utils.interpolateStringFromObject(input, context);
        expect(output).toBe('User: user123, Pass: pass456');
    });

    it('returns string unchanged if no placeholders', () => {
        const input = 'Just a static string';
        const output = utils.interpolateStringFromObject(input, context);
        expect(output).toBe(input);
    });

    it('works with multiple mixed expressions', () => {
        const input = 'Hi ${name}, auth=${base64(${credentials.username}:${credentials.apiKey})}, age=${age}';
        const encoded = Buffer.from('user123:XYZ-987').toString('base64');
        const output = utils.interpolateStringFromObject(input, context);
        expect(output).toBe(`Hi Alice, auth=${encoded}, age=30`);
    });

    it('handles plain token interpolation', () => {
        const input = 'Bearer ${token}';
        const output = utils.interpolateStringFromObject(input, context);
        expect(output).toBe('Bearer abc.def.ghi');
    });

    it('handles base64 encoding of a combined interpolated string', () => {
        const input = 'Authorization: ${base64(${credentials.apiKey}:${token})}';
        const output = utils.interpolateStringFromObject(input, context);
        const expected = Buffer.from('XYZ-987:abc.def.ghi').toString('base64');
        expect(output).toBe(`Authorization: ${expected}`);
    });

    it('interpolates ${sha256Hex(inner)} with hex digest of resolved inner', () => {
        const input = 'Sig: ${sha256Hex(${credentials.username})}';
        const output = utils.interpolateStringFromObject(input, context);
        const expected = crypto.createHash('sha256').update('user123', 'utf8').digest('hex');
        expect(output).toBe(`Sig: ${expected}`);
    });

    it('interpolates base64 nested inside sha256Hex', () => {
        const input = 'Sig: ${sha256Hex(${base64(${credentials.username}:${credentials.password})})}';
        const output = utils.interpolateStringFromObject(input, context);
        const base64Value = Buffer.from('user123:pass456').toString('base64');
        const expected = crypto.createHash('sha256').update(base64Value, 'utf8').digest('hex');
        expect(output).toBe(`Sig: ${expected}`);
    });

    it('interpolates ${now} with replacer when provided', () => {
        const replacers = { now: '2026-03-02T10:00:00.000Z' };
        const input = 'At: ${now}';
        const output = utils.interpolateStringFromObject(input, replacers);
        expect(output).toBe('At: 2026-03-02T10:00:00.000Z');
    });

    it('interpolates ${now:YYYY-MM-DDTHH:mm:ss} with replacer when provided', () => {
        const replacers = { now: '2026-03-02T10:05:30.000Z' };
        const input = 'TS: ${now:YYYY-MM-DDTHH:mm:ss}';
        const output = utils.interpolateStringFromObject(input, replacers);
        expect(output).toBe('TS: 2026-03-02T10:05:30');
    });

    it('interpolates ${random} with replacer when provided', () => {
        const replacers = { random: 'my-fixed-uuid' };
        const input = 'ReqId: ${random}';
        const output = utils.interpolateStringFromObject(input, replacers);
        expect(output).toBe('ReqId: my-fixed-uuid');
    });

    it('interpolates ${endpoint} with replacer when provided', () => {
        const replacers = { endpoint: '/v1.0/msp/tenants' };
        const input = 'Path: ${endpoint}';
        const output = utils.interpolateStringFromObject(input, replacers);
        expect(output).toBe('Path: /v1.0/msp/tenants');
    });

    it('interpolates ${endpoint} with empty string when not in replacers', () => {
        const input = 'Path: ${endpoint}';
        const output = utils.interpolateStringFromObject(input, {});
        expect(output).toBe('Path: ');
    });

    it('resolves flat dot-notation keys (e.g. from webhook_response_metadata)', () => {
        // getConnectionMetadata extracts dot-notation keys from the payload and stores them
        // as flat keys with a literal dot in the name, e.g.: webhook_response_metadata: ['installation.uuid']
        // The template url ${connectionConfig.installation.uuid} (token or authorization) needs to resolve
        // 'installation.uuid' as a flat key lookup when nested traversal finds nothing.
        const replacers = { 'installation.uuid': 'a87e0eb2-4fb3-4965-9580-6f5bb9ccc5de' };
        const input = 'https://sentry.io/api/0/sentry-app-installations/${installation.uuid}/authorizations/';
        const output = utils.interpolateStringFromObject(input, replacers);
        expect(output).toBe('https://sentry.io/api/0/sentry-app-installations/a87e0eb2-4fb3-4965-9580-6f5bb9ccc5de/authorizations/');
    });

    it('prefers nested traversal over flat key when both exist', () => {
        const replacers = {
            'installation.uuid': 'flat-value',
            installation: { uuid: 'nested-value' }
        };
        const output = utils.interpolateStringFromObject('${installation.uuid}', replacers);
        expect(output).toBe('nested-value');
    });

    it('leaves placeholder unchanged when key is missing entirely', () => {
        const output = utils.interpolateStringFromObject('${missing.key}', {});
        expect(output).toBe('${missing.key}');
    });
});

describe('interpolateObjectValues', () => {
    it('uses connectionConfig value when present', () => {
        const obj = {
            audience: '${connectionConfig.audience} || https://api.pax8.com'
        };

        const result = utils.interpolateObjectValues(obj, { audience: 'https://custom.example.com' });
        expect(result['audience']).toBe('https://custom.example.com');
    });

    it('falls back to literal when connectionConfig value is missing', () => {
        const obj = {
            audience: '${connectionConfig.audience} || https://api.pax8.com'
        };

        const result = utils.interpolateObjectValues(obj, {});
        expect(result['audience']).toBe('https://api.pax8.com');
    });
});

describe('interpolateObject', () => {
    it('interpolates string values in a flat object', () => {
        const obj = { greeting: 'Hello ${name}', count: '${count}' };
        const dynamicValues = { name: 'World', count: 42 };
        const result = utils.interpolateObject(obj, dynamicValues);
        expect(result).toEqual({ greeting: 'Hello World', count: '42' });
    });

    it('interpolates nested objects recursively', () => {
        const obj = { level1: { level2: '${a}-${b}' } };
        const dynamicValues = { a: 'x', b: 'y' };
        const result = utils.interpolateObject(obj, dynamicValues);
        expect(result).toEqual({ level1: { level2: 'x-y' } });
    });

    it('leaves non-string values unchanged', () => {
        const obj = { str: '${x}', num: 100, bool: true, nil: null };
        const dynamicValues = { x: 'filled' };
        const result = utils.interpolateObject(obj, dynamicValues);
        expect(result).toEqual({ str: 'filled', num: 100, bool: true, nil: null });
    });

    it('uses optionalReplacers when provided, without mutating dynamicValues', () => {
        const obj = { id: '${random}', time: '${now}' };
        const dynamicValues = { other: 'value' };
        const optionalReplacers = { random: 'fixed-uuid-123', now: '2026-01-15T12:00:00.000Z' };
        const result = utils.interpolateObject(obj, dynamicValues, optionalReplacers);
        expect(result).toEqual({ id: 'fixed-uuid-123', time: '2026-01-15T12:00:00.000Z' });
        expect(dynamicValues).not.toHaveProperty('random');
        expect(dynamicValues).not.toHaveProperty('now');
    });

    it('optionalReplacers override dynamicValues for same key', () => {
        const obj = { key: '${foo}' };
        const dynamicValues = { foo: 'from-dynamic' };
        const optionalReplacers = { foo: 'from-optional' };
        const result = utils.interpolateObject(obj, dynamicValues, optionalReplacers);
        expect(result).toEqual({ key: 'from-optional' });
    });

    it('works without optionalReplacers (two-arg signature)', () => {
        const obj = { a: '${x}' };
        const dynamicValues = { x: 'only' };
        const result = utils.interpolateObject(obj, dynamicValues);
        expect(result).toEqual({ a: 'only' });
    });
});

describe('parseTokenExpirationDate', () => {
    it('should return the same Date instance if input is already a Date', () => {
        const now = new Date();
        expect(utils.parseTokenExpirationDate(now)).toBe(now);
    });

    it('should convert a UNIX timestamp (in seconds) to a Date', () => {
        const unixSeconds = 1719240000;
        const expected = new Date(unixSeconds * 1000);
        expect(utils.parseTokenExpirationDate(unixSeconds)?.getTime()).toBe(expected.getTime());
    });

    it('should parse a valid ISO 8601 string', () => {
        const isoString = '2025-06-24T12:34:56.000Z';
        const expected = new Date(isoString);
        expect(utils.parseTokenExpirationDate(isoString)?.toISOString()).toBe(expected.toISOString());
    });

    it('should parse Tableau-style "D+:HH:MM" duration string', () => {
        const baseTime = new Date('2025-01-01T00:00:00Z').getTime();
        vi.setSystemTime(baseTime);

        const input = '1:01:30';
        const result = utils.parseTokenExpirationDate(input);
        const expected = new Date(baseTime + ((1 * 24 + 1) * 60 + 30) * 60 * 1000);
        expect(result?.getTime()).toBe(expected.getTime());

        vi.useRealTimers();
    });

    it('should return undefined for invalid date strings', () => {
        expect(utils.parseTokenExpirationDate('not-a-date')).toBeUndefined();
    });

    it('should return undefined for invalid "D+:HH:MM" formats', () => {
        expect(utils.parseTokenExpirationDate('1:99:99')).toBeUndefined();
        expect(utils.parseTokenExpirationDate('abc')).toBeUndefined();
        expect(utils.parseTokenExpirationDate('12:30')).toBeUndefined();
    });

    it('should return undefined for unsupported types', () => {
        expect(utils.parseTokenExpirationDate(null)).toBeUndefined();
        expect(utils.parseTokenExpirationDate(undefined)).toBeUndefined();
        expect(utils.parseTokenExpirationDate({})).toBeUndefined();
    });

    it('should handle a full timestamp in milliseconds', () => {
        const millisecondsTimestamp = Date.now();
        const expected = new Date(millisecondsTimestamp);
        expect(utils.parseTokenExpirationDate(millisecondsTimestamp)?.getTime()).toBe(expected.getTime());
    });
});

describe('getRedisUrl', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should return undefined when no relevant env vars are set', () => {
        delete process.env['NANGO_REDIS_URL'];
        delete process.env['NANGO_REDIS_HOST'];
        delete process.env['NANGO_REDIS_PORT'];
        delete process.env['NANGO_REDIS_AUTH'];

        const result = utils.getRedisUrl();
        expect(result).toBeUndefined();
    });

    it('should return NANGO_REDIS_URL when it is set', () => {
        process.env['NANGO_REDIS_URL'] = 'redis://localhost:6379';
        delete process.env['NANGO_REDIS_HOST'];
        delete process.env['NANGO_REDIS_PORT'];
        delete process.env['NANGO_REDIS_AUTH'];

        const result = utils.getRedisUrl();
        expect(result).toBe('redis://localhost:6379');
    });

    it('should return undefined when only some of the other env vars are set', () => {
        delete process.env['NANGO_REDIS_URL'];
        process.env['NANGO_REDIS_HOST'] = 'localhost';
        process.env['NANGO_REDIS_PORT'] = '6379';
        // NANGO_REDIS_AUTH is missing

        const result = utils.getRedisUrl();
        expect(result).toBeUndefined();
    });

    it('should return constructed URL when all other env vars are set', () => {
        delete process.env['NANGO_REDIS_URL'];
        process.env['NANGO_REDIS_HOST'] = 'localhost';
        process.env['NANGO_REDIS_PORT'] = '6379';
        process.env['NANGO_REDIS_AUTH'] = 'password';

        const result = utils.getRedisUrl();
        expect(result).toBe('rediss://:password@localhost:6379');
    });
});

describe('makeUrl', () => {
    it('should interpolate a basic URL template with config', () => {
        const template = 'https://api.example.com/${connectionConfig.subdomain}';
        const config = { subdomain: 'myapp' };
        const result = utils.makeUrl(template, config);
        expect(result.href).toBe('https://api.example.com/myapp');
    });

    it('should handle regional URLs with fallbacks', () => {
        const template = 'https://api.${connectionConfig.region}.intercom.com || https://api.intercom.com';
        const config = { region: 'eu' };
        const result = utils.makeUrl(template, config);
        expect(result.href).toBe('https://api.eu.intercom.com/');
    });

    it('should use fallback URL when region is not provided', () => {
        const template = 'https://api.${connectionConfig.region}.intercom.com || https://api.intercom.com';
        const config = {};
        const result = utils.makeUrl(template, config);
        expect(result.href).toBe('https://api.intercom.com/');
    });

    it('should use fallback URL when region is empty string', () => {
        const template = 'https://api.${connectionConfig.region}.intercom.com || https://api.intercom.com';
        const config = { region: '' };
        const result = utils.makeUrl(template, config);
        expect(result.href).toBe('https://api.intercom.com/');
    });

    it('should handle interpolation if it should happen more than ones', () => {
        const template = 'https://api.example.com/${connectionConfig.workspace}/${connectionConfig.version}';
        const config = { workspace: 'myworkspace', version: 'v2' };
        const result = utils.makeUrl(template, config);
        expect(result.href).toBe('https://api.example.com/myworkspace/v2');
    });

    it('should throw error when template has unresolved placeholders', () => {
        const template = 'https://api.example.com/${connectionConfig.subdomain}';
        const config = {};
        expect(() => utils.makeUrl(template, config)).toThrow('Failed to interpolate URL template');
    });

    it('should throw error when interpolated URL is invalid', () => {
        const template = '${connectionConfig.invalidUrl}';
        const config = { invalidUrl: 'not-a-valid-url' };
        expect(() => utils.makeUrl(template, config)).toThrow('Invalid URL after interpolation');
    });

    it('should strip credentials. prefix and interpolate with merged config', () => {
        const template = 'https://api.example.com/auth?user=${credentials.username}';
        const config = { username: 'alice' };
        const result = utils.makeUrl(template, config, ['base_url']);
        expect(result.toString()).toBe('https://api.example.com/auth?user=alice');
    });
});

describe('now formatting', () => {
    it('supports dayjs format tokens with UTC output', () => {
        const output = utils.interpolateString('TS: ${now:YYYY-MM-DDTHH:mm:ss.SSS}', { now: '2025-03-15T14:30:45.123Z' });
        expect(output).toBe('TS: 2025-03-15T14:30:45.123');
    });
});

describe('awsSigV4 interpolation', () => {
    const NOW = '2024-01-15T10:30:00.000Z';
    const ACCESS_KEY = 'TEST_ACCESS_KEY_ID'; // more generic key
    const SECRET_KEY = 'TEST_SECRET_ACCESS_KEY';
    const REGION = 'us-east-1';
    const SERVICE = 'iam';

    function computeExpectedAuth(
        accessKeyId: string,
        secretKey: string,
        region: string,
        service: string,
        isoNow: string,
        method = 'GET',
        path = '/',
        urlCanonicalParams = '',
        bodyCanonicalParams = '',
        contentType = ''
    ): string {
        const date = isoNow.replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = date.slice(0, 8);
        const host = `${service}.amazonaws.com`;
        const querystring = urlCanonicalParams;
        const payloadHash = crypto.createHash('sha256').update(bodyCanonicalParams).digest('hex');
        const canonicalHeaders = contentType ? `content-type:${contentType}\nhost:${host}\nx-amz-date:${date}\n` : `host:${host}\nx-amz-date:${date}\n`;
        const signedHeaders = contentType ? 'content-type;host;x-amz-date' : 'host;x-amz-date';
        const canonicalRequest = `${method}\n${path}\n${querystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
        const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
        const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;
        const kDate = crypto.createHmac('sha256', `AWS4${secretKey}`).update(dateStamp).digest();
        const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
        const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
        const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
        const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
        return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    }

    it('produces a valid AWS4-HMAC-SHA256 authorization header', () => {
        const input = '${awsSigV4(${credentials.username}, ${credentials.password}, ${connectionConfig.region}, iam)}';
        const result = utils.interpolateString(input, {
            now: NOW,
            credentials: { username: ACCESS_KEY, password: SECRET_KEY },
            connectionConfig: { region: REGION }
        });
        expect(result).toBe(computeExpectedAuth(ACCESS_KEY, SECRET_KEY, REGION, SERVICE, NOW));
    });

    it('uses the now replacer for timestamp consistency', () => {
        const input = '${awsSigV4(KEY, SECRET, us-west-2, iam)}';
        const result = utils.interpolateString(input, { now: '2024-06-01T00:00:00.000Z' });
        expect(result).toContain('Credential=KEY/20240601/us-west-2/iam/aws4_request');
    });

    it('returns the expression unchanged when arg count is wrong', () => {
        const input = '${awsSigV4(KEY, SECRET, us-east-1)}';
        const result = utils.interpolateString(input, { now: NOW });
        expect(result).toBe(input);
    });

    it('GET: puts URL params in canonical query string with empty payload hash', () => {
        const input = '${awsSigV4(KEY, SECRET, us-east-1, iam)}';
        const urlParams = 'Action=ListUsers&Version=2010-05-08';
        const result = utils.interpolateString(input, { now: NOW, method: 'GET', path: '/', urlCanonicalParams: urlParams, bodyCanonicalParams: '' });
        expect(result).toBe(computeExpectedAuth('KEY', 'SECRET', 'us-east-1', 'iam', NOW, 'GET', '/', urlParams, ''));
    });

    it('POST with URL params (IAM style): uses URL params as canonical query string and empty payload hash', () => {
        const input = '${awsSigV4(KEY, SECRET, us-east-1, iam)}';
        const urlParams = 'Action=CreateUser&UserName=alice&Version=2010-05-08';
        const result = utils.interpolateString(input, { now: NOW, method: 'POST', path: '/', urlCanonicalParams: urlParams, bodyCanonicalParams: '' });
        expect(result).toBe(computeExpectedAuth('KEY', 'SECRET', 'us-east-1', 'iam', NOW, 'POST', '/', urlParams, ''));
    });

    it('POST with body: empty canonical query string with hashed body as payload', () => {
        const input = '${awsSigV4(KEY, SECRET, us-east-1, iam)}';
        const body = 'key=value&other=data';
        const result = utils.interpolateString(input, { now: NOW, method: 'POST', path: '/', urlCanonicalParams: '', bodyCanonicalParams: body });
        expect(result).toBe(computeExpectedAuth('KEY', 'SECRET', 'us-east-1', 'iam', NOW, 'POST', '/', '', body));
        // Must differ from POST with same content in URL params (different payload hash)
        const urlParamsResult = utils.interpolateString(input, { now: NOW, method: 'POST', path: '/', urlCanonicalParams: body, bodyCanonicalParams: '' });
        expect(result).not.toBe(urlParamsResult);
    });

    it('POST with form body: includes content-type in signed headers and hashes raw body', () => {
        const input = '${awsSigV4(KEY, SECRET, us-east-1, iam)}';
        const body = 'Action=CreateUser&UserName=alice&Version=2010-05-08';
        const ct = 'application/x-www-form-urlencoded';
        const result = utils.interpolateString(input, {
            now: NOW,
            method: 'POST',
            path: '/',
            urlCanonicalParams: '',
            bodyCanonicalParams: body,
            contentType: ct
        });
        expect(result).toBe(computeExpectedAuth('KEY', 'SECRET', 'us-east-1', 'iam', NOW, 'POST', '/', '', body, ct));
        // Must differ from same call without content-type (different signed headers)
        const withoutCt = utils.interpolateString(input, { now: NOW, method: 'POST', path: '/', urlCanonicalParams: '', bodyCanonicalParams: body });
        expect(result).not.toBe(withoutCt);
    });

    it('${now:YYYYMMDDTHHmmss[Z]} produces the date format used internally for signing', () => {
        const date = utils.interpolateString('${now:YYYYMMDDTHHmmss[Z]}', { now: NOW });
        expect(date).toBe('20240115T103000Z');
        // The credential scope in the auth header uses the date stamp (first 8 chars)
        const auth = utils.interpolateString('${awsSigV4(KEY, SECRET, us-east-1, iam)}', { now: NOW });
        expect(auth).toContain(`Credential=KEY/${date.slice(0, 8)}/`);
    });
});
