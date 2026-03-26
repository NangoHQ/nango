import { describe, expect, it } from 'vitest';

import connectionService from './connection.service.js';
import { REFRESH_MARGIN_MS } from './connections/utils.js';

import type { ProviderTwoStep, TwoStepCredentials } from '@nangohq/types';

function makeJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${body}.fakesig`;
}

describe('connection.service parseRawCredentials', () => {
    describe('TWO_STEP token_expires_in_ms', () => {
        it('token_expires_in_ms = 0 => no expiresAt (infinite token); change this test if you change that logic', () => {
            const template: ProviderTwoStep = {
                display_name: 'Test',
                docs: 'https://example.com',
                auth_mode: 'TWO_STEP',
                token_response: {
                    token: 'access_token'
                },
                token_expires_in_ms: 0
            };
            const rawCreds = { access_token: 'some-token' };

            const result = connectionService.parseRawCredentials(rawCreds, 'TWO_STEP', template) as TwoStepCredentials;

            expect(result.type).toBe('TWO_STEP');
            expect(result.expires_at).toBeUndefined();
        });
    });

    describe('TWO_STEP refresh token JWT exp introspection', () => {
        it('refresh token JWT expiry is sooner => uses refresh token expiry', () => {
            const accessTokenExp = Math.floor(Date.now() / 1000) + 3600; // 1h from now
            const refreshTokenExp = Math.floor(Date.now() / 1000) + 600; // 10min from now (sooner)
            const template: ProviderTwoStep = {
                display_name: 'Test',
                docs: 'https://example.com',
                auth_mode: 'TWO_STEP',
                token_response: {
                    token: 'access_token',
                    token_expiration: 'expires',
                    token_expiration_strategy: 'expireAt',
                    refresh_token: 'refresh_token'
                }
            };
            const rawCreds = {
                access_token: 'at',
                expires: new Date(accessTokenExp * 1000).toISOString(),
                refresh_token: makeJwt({ exp: refreshTokenExp })
            };

            const result = connectionService.parseRawCredentials(rawCreds, 'TWO_STEP', template) as TwoStepCredentials;

            expect(result.expires_at).toEqual(new Date(refreshTokenExp * 1000 - REFRESH_MARGIN_MS));
        });

        it('access token expiry is sooner => keeps access token expiry', () => {
            const accessTokenExp = Math.floor(Date.now() / 1000) + 600; // 10min from now (sooner)
            const refreshTokenExp = Math.floor(Date.now() / 1000) + 86400; // 1 day from now
            const template: ProviderTwoStep = {
                display_name: 'Test',
                docs: 'https://example.com',
                auth_mode: 'TWO_STEP',
                token_response: {
                    token: 'access_token',
                    token_expiration: 'expires',
                    token_expiration_strategy: 'expireAt',
                    refresh_token: 'refresh_token'
                }
            };
            const rawCreds = {
                access_token: 'at',
                expires: new Date(accessTokenExp * 1000).toISOString(),
                refresh_token: makeJwt({ exp: refreshTokenExp })
            };

            const result = connectionService.parseRawCredentials(rawCreds, 'TWO_STEP', template) as TwoStepCredentials;

            expect(result.expires_at!.getTime()).toBeCloseTo(accessTokenExp * 1000, -3);
        });

        it('refresh token is not a JWT => falls back to access token expiry', () => {
            const accessTokenExp = Math.floor(Date.now() / 1000) + 3600;
            const template: ProviderTwoStep = {
                display_name: 'Test',
                docs: 'https://example.com',
                auth_mode: 'TWO_STEP',
                token_response: {
                    token: 'access_token',
                    token_expiration: 'expires',
                    token_expiration_strategy: 'expireAt',
                    refresh_token: 'refresh_token'
                }
            };
            const rawCreds = {
                access_token: 'at',
                expires: new Date(accessTokenExp * 1000).toISOString(),
                refresh_token: 'not-a-jwt-opaque-token'
            };

            const result = connectionService.parseRawCredentials(rawCreds, 'TWO_STEP', template) as TwoStepCredentials;

            expect(result.expires_at!.getTime()).toBeCloseTo(accessTokenExp * 1000, -3);
        });

        it('refresh token looks like a JWT but payload cannot be decoded => falls back to access token expiry', () => {
            const accessTokenExp = Math.floor(Date.now() / 1000) + 3600;
            const template: ProviderTwoStep = {
                display_name: 'Test',
                docs: 'https://example.com',
                auth_mode: 'TWO_STEP',
                token_response: {
                    token: 'access_token',
                    token_expiration: 'expires',
                    token_expiration_strategy: 'expireAt',
                    refresh_token: 'refresh_token'
                }
            };
            const rawCreds = {
                access_token: 'at',
                expires: new Date(accessTokenExp * 1000).toISOString(),
                refresh_token: 'header.!!!invalid-base64!!!.sig' // JWT-shaped but corrupted payload
            };

            const result = connectionService.parseRawCredentials(rawCreds, 'TWO_STEP', template) as TwoStepCredentials;

            expect(result.expires_at!.getTime()).toBeCloseTo(accessTokenExp * 1000, -3);
        });

        it('refresh token JWT has no exp claim => falls back to access token expiry', () => {
            const accessTokenExp = Math.floor(Date.now() / 1000) + 3600;
            const template: ProviderTwoStep = {
                display_name: 'Test',
                docs: 'https://example.com',
                auth_mode: 'TWO_STEP',
                token_response: {
                    token: 'access_token',
                    token_expiration: 'expires',
                    token_expiration_strategy: 'expireAt',
                    refresh_token: 'refresh_token'
                }
            };
            const rawCreds = {
                access_token: 'at',
                expires: new Date(accessTokenExp * 1000).toISOString(),
                refresh_token: makeJwt({ sub: 'user123' }) // no exp
            };

            const result = connectionService.parseRawCredentials(rawCreds, 'TWO_STEP', template) as TwoStepCredentials;

            expect(result.expires_at!.getTime()).toBeCloseTo(accessTokenExp * 1000, -3);
        });
    });
});
