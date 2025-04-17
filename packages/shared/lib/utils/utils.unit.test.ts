import { expect, describe, it } from 'vitest';
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

    const result = utils.getConnectionMetadataFromTokenResponse(params, provider);
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

    const result = utils.getConnectionMetadataFromTokenResponse(params, provider);
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

    const result = utils.getConnectionMetadataFromTokenResponse(params, provider);
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

    it('should resolve values inside base64 properly', () => {
        const input = '${base64(${username}:${password})}';
        const output = utils.interpolateString(input, replacers);
        const expected = Buffer.from('john:doe123').toString('base64');
        expect(output).toBe(expected);
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
});
