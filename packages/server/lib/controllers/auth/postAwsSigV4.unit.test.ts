import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { postPublicAwsSigV4Authorization } from './postAwsSigV4.js';

import type * as AuthUtilsModule from '../../utils/auth.js';
import type * as DatabaseModule from '@nangohq/database';
import type * as SharedModule from '@nangohq/shared';
import type { Request, Response } from 'express';

const {
    mockCreateLogContext,
    mockGenerateConnectionId,
    mockGetConnection,
    mockGetProviderConfig,
    mockGetProvider,
    mockGetAwsSigV4Settings,
    mockFetchAwsTemporaryCredentials,
    mockIsValidAwsRegion,
    mockGetProxyConfiguration,
    mockProxyRequest,
    mockReport,
    mockLogWarn,
    mockIsIntegrationAllowed,
    mockHmacCheck,
    mockValidateConnection,
    mockConnectionCreated,
    mockConnectionCreationFailed,
    mockUpsertAuthConnection
} = vi.hoisted(() => {
    return {
        mockCreateLogContext: vi.fn(),
        mockGenerateConnectionId: vi.fn(),
        mockGetConnection: vi.fn(),
        mockGetProviderConfig: vi.fn(),
        mockGetProvider: vi.fn(),
        mockGetAwsSigV4Settings: vi.fn(),
        mockFetchAwsTemporaryCredentials: vi.fn(),
        mockIsValidAwsRegion: vi.fn(),
        mockGetProxyConfiguration: vi.fn(),
        mockProxyRequest: vi.fn(),
        mockReport: vi.fn(),
        mockLogWarn: vi.fn(),
        mockIsIntegrationAllowed: vi.fn(),
        mockHmacCheck: vi.fn(),
        mockValidateConnection: vi.fn(),
        mockConnectionCreated: vi.fn(),
        mockConnectionCreationFailed: vi.fn(),
        mockUpsertAuthConnection: vi.fn()
    };
});

vi.mock('@nangohq/database', async () => {
    const actual: typeof DatabaseModule = await vi.importActual('@nangohq/database');

    return {
        ...actual,
        default: { knex: {} }
    };
});

vi.mock('@nangohq/logs', () => ({
    defaultOperationExpiration: { auth: () => new Date('2026-01-01T00:00:00.000Z') },
    endUserToMeta: vi.fn(() => null),
    logContextGetter: {
        create: mockCreateLogContext,
        get: vi.fn()
    }
}));

vi.mock('@nangohq/shared', async () => {
    const actual: typeof SharedModule = await vi.importActual('@nangohq/shared');

    class MockNangoError extends Error {
        type: string;
        status: number;
        payload: Record<string, unknown>;
        additional_properties: Record<string, unknown>;

        constructor(type: string, payload: Record<string, unknown> = {}) {
            super(type);
            this.type = type;
            this.status = 400;
            this.payload = payload;
            this.additional_properties = {};
        }
    }

    return {
        ...actual,
        ErrorSourceEnum: { PLATFORM: 'platform' },
        LogActionEnum: { AUTH: 'auth' },
        NangoError: MockNangoError,
        ProxyRequest: class {
            request() {
                return mockProxyRequest();
            }
        },
        awsSigV4Client: {
            getAwsSigV4Settings: mockGetAwsSigV4Settings,
            fetchAwsTemporaryCredentials: mockFetchAwsTemporaryCredentials,
            isValidAwsRegion: mockIsValidAwsRegion
        },
        configService: {
            getProviderConfig: mockGetProviderConfig
        },
        connectionService: {
            generateConnectionId: mockGenerateConnectionId,
            getConnection: mockGetConnection,
            getConnectionById: vi.fn(),
            upsertAuthConnection: mockUpsertAuthConnection,
            hardDelete: vi.fn()
        },
        errorManager: {
            errResFromNangoErr: vi.fn(),
            report: mockReport
        },
        getProvider: mockGetProvider,
        getProxyConfiguration: mockGetProxyConfiguration,
        syncEndUserToConnection: vi.fn()
    };
});

vi.mock('../../hooks/connection/on/validate-connection.js', () => ({
    validateConnection: mockValidateConnection
}));

vi.mock('../../hooks/hooks.js', () => ({
    connectionCreated: mockConnectionCreated,
    connectionCreationFailed: mockConnectionCreationFailed
}));

vi.mock('../../utils/auth.js', async () => {
    const actual: typeof AuthUtilsModule = await vi.importActual('../../utils/auth.js');
    return {
        ...actual,
        errorRestrictConnectionId: vi.fn(),
        isIntegrationAllowed: mockIsIntegrationAllowed
    };
});

vi.mock('../../utils/hmac.js', () => ({
    hmacCheck: mockHmacCheck
}));

describe('postPublicAwsSigV4Authorization', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockCreateLogContext.mockResolvedValue({
            error: vi.fn(),
            failed: vi.fn(),
            enrichOperation: vi.fn(),
            warn: mockLogWarn,
            log: vi.fn(),
            info: vi.fn(),
            success: vi.fn()
        });
        mockGenerateConnectionId.mockReturnValue('generated-connection-id');
        mockGetConnection.mockResolvedValue({ response: null });
        mockGetProviderConfig.mockResolvedValue({
            id: 1,
            unique_key: 'aws-sigv4',
            provider: 'aws-sigv4',
            custom: { service: 's3', stsMode: 'builtin', awsAccessKeyId: 'AKIA', awsSecretAccessKey: 'secret' }
        });
        mockGetProvider.mockReturnValue({ auth_mode: 'AWS_SIGV4' });
        mockGetAwsSigV4Settings.mockReturnValue(
            Ok({
                service: 's3',
                stsMode: 'builtin',
                builtinCredentials: { awsAccessKeyId: 'AKIA', awsSecretAccessKey: 'secret' },
                defaultRegion: 'us-east-1'
            })
        );
        mockFetchAwsTemporaryCredentials.mockResolvedValue(
            Ok({
                accessKeyId: 'temp-key',
                secretAccessKey: 'temp-secret',
                sessionToken: 'temp-session',
                expiresAt: new Date('2026-01-02T00:00:00.000Z')
            })
        );
        mockIsValidAwsRegion.mockReturnValue(true);
        mockGetProxyConfiguration.mockReturnValue(Ok({}));
        mockProxyRequest.mockResolvedValue(Err(new Error('GetCallerIdentity failed')));
        mockIsIntegrationAllowed.mockResolvedValue(true);
        mockHmacCheck.mockResolvedValue(true);
        mockValidateConnection.mockResolvedValue(Ok({ tested: true }));
        mockUpsertAuthConnection.mockResolvedValue([
            { connection: { id: 1, connection_id: 'generated-connection-id', provider_config_key: 'aws-sigv4' }, operation: 'creation' }
        ]);
    });

    // Drive the controller all the way to a successful upsert: GetCallerIdentity must return an ARN
    // whose role name matches the requested role_arn.
    const succeedCredentialVerification = () =>
        mockProxyRequest.mockResolvedValue(
            Ok({
                data: '<GetCallerIdentityResponse><GetCallerIdentityResult><Arn>arn:aws:sts::123456789012:assumed-role/NangoAccessRole/session</Arn></GetCallerIdentityResult></GetCallerIdentityResponse>'
            })
        );

    // The override is only honored from the backend-set connect session `webhook_url_override`, never from client params.
    const connectSessionWithOverride = {
        operationId: null,
        connectionId: null,
        allowedIntegrations: null,
        webhookUrlOverride: 'https://override.example.com/hook'
    };
    const sessionTokenQuery = { connect_session_token: `nango_connect_session_${'a'.repeat(64)}` };

    it('returns connection_test_failed when AWS credential verification fails', async () => {
        const req = {
            body: { role_arn: 'arn:aws:iam::123456789012:role/NangoAccessRole', region: 'us-east-1' },
            query: { public_key: '550e8400-e29b-41d4-a716-446655440000' },
            params: { providerConfigKey: 'aws-sigv4' },
            route: { path: '/auth/aws-sigv4/:providerConfigKey' },
            originalUrl: '/auth/aws-sigv4/aws-sigv4',
            header: vi.fn()
        } as unknown as Request;

        const status = vi.fn().mockReturnThis();
        const send = vi.fn().mockReturnThis();
        const res = {
            locals: {
                account: { id: 1 },
                environment: { id: 2 },
                connectSession: null,
                authType: 'publicKey',
                endUser: null
            },
            status,
            send
        } as unknown as Response;
        const next = vi.fn();

        await postPublicAwsSigV4Authorization(req, res, next);

        expect(status).toHaveBeenCalledWith(400);
        expect(send).toHaveBeenCalledWith({
            error: {
                code: 'connection_test_failed',
                message: 'GetCallerIdentity failed'
            }
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns connection_test_failed when GetCallerIdentity returns a different role', async () => {
        mockProxyRequest.mockResolvedValue(
            Ok({
                data: '<GetCallerIdentityResponse><GetCallerIdentityResult><Arn>arn:aws:sts::123456789012:assumed-role/UnexpectedRole/session</Arn></GetCallerIdentityResult></GetCallerIdentityResponse>'
            })
        );

        const req = {
            body: { role_arn: 'arn:aws:iam::123456789012:role/NangoAccessRole', region: 'us-east-1' },
            query: { public_key: '550e8400-e29b-41d4-a716-446655440000' },
            params: { providerConfigKey: 'aws-sigv4' },
            route: { path: '/auth/aws-sigv4/:providerConfigKey' },
            originalUrl: '/auth/aws-sigv4/aws-sigv4',
            header: vi.fn()
        } as unknown as Request;

        const status = vi.fn().mockReturnThis();
        const send = vi.fn().mockReturnThis();
        const res = {
            locals: {
                account: { id: 1 },
                environment: { id: 2 },
                connectSession: null,
                authType: 'publicKey',
                endUser: null
            },
            status,
            send
        } as unknown as Response;
        const next = vi.fn();

        await postPublicAwsSigV4Authorization(req, res, next);

        expect(status).toHaveBeenCalledWith(400);
        expect(send).toHaveBeenCalledWith({
            error: {
                code: 'connection_test_failed',
                message: 'GetCallerIdentity ARN does not match expected role'
            }
        });
        expect(mockLogWarn).toHaveBeenCalledWith('GetCallerIdentity ARN does not match expected role', {
            expectedRoleArn: 'arn:aws:iam::123456789012:role/NangoAccessRole',
            actualArn: 'arn:aws:sts::123456789012:assumed-role/UnexpectedRole/session'
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('stores the per-connection webhook URL override as webhook_url_override (not connection_config)', async () => {
        succeedCredentialVerification();

        const req = {
            body: { role_arn: 'arn:aws:iam::123456789012:role/NangoAccessRole', region: 'us-east-1' },
            query: sessionTokenQuery,
            params: { providerConfigKey: 'aws-sigv4' },
            route: { path: '/auth/aws-sigv4/:providerConfigKey' },
            originalUrl: '/auth/aws-sigv4/aws-sigv4',
            header: vi.fn()
        } as unknown as Request;

        const res = {
            locals: { account: { id: 1 }, environment: { id: 2 }, connectSession: connectSessionWithOverride, authType: 'connectSession', endUser: null },
            status: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis()
        } as unknown as Response;
        const next = vi.fn();

        await postPublicAwsSigV4Authorization(req, res, next);

        expect(mockUpsertAuthConnection).toHaveBeenCalledWith(
            expect.objectContaining({
                webhookUrlOverride: 'https://override.example.com/hook',
                connectionConfig: expect.objectContaining({
                    role_arn: 'arn:aws:iam::123456789012:role/NangoAccessRole',
                    region: 'us-east-1'
                })
            })
        );
        expect(mockUpsertAuthConnection).toHaveBeenCalledWith(
            expect.objectContaining({ connectionConfig: expect.not.objectContaining({ webhook_url: expect.anything() }) })
        );
    });

    it('ignores a client-supplied webhook_url param', async () => {
        succeedCredentialVerification();

        const req = {
            body: { role_arn: 'arn:aws:iam::123456789012:role/NangoAccessRole', region: 'us-east-1' },
            query: { public_key: '550e8400-e29b-41d4-a716-446655440000', params: { webhook_url: 'https://attacker.example.com/hook' } },
            params: { providerConfigKey: 'aws-sigv4' },
            route: { path: '/auth/aws-sigv4/:providerConfigKey' },
            originalUrl: '/auth/aws-sigv4/aws-sigv4',
            header: vi.fn()
        } as unknown as Request;

        const res = {
            locals: { account: { id: 1 }, environment: { id: 2 }, connectSession: null, authType: 'publicKey', endUser: null },
            status: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis()
        } as unknown as Response;
        const next = vi.fn();

        await postPublicAwsSigV4Authorization(req, res, next);

        expect(mockUpsertAuthConnection).toHaveBeenCalledWith(
            expect.objectContaining({ connectionConfig: expect.not.objectContaining({ webhook_url: expect.anything() }) })
        );
    });

    it('threads the per-connection webhook URL override into the creation-failure hook', async () => {
        succeedCredentialVerification();
        mockUpsertAuthConnection.mockRejectedValue(new Error('boom'));

        const req = {
            body: { role_arn: 'arn:aws:iam::123456789012:role/NangoAccessRole', region: 'us-east-1' },
            query: sessionTokenQuery,
            params: { providerConfigKey: 'aws-sigv4' },
            route: { path: '/auth/aws-sigv4/:providerConfigKey' },
            originalUrl: '/auth/aws-sigv4/aws-sigv4',
            header: vi.fn()
        } as unknown as Request;

        const res = {
            locals: { account: { id: 1 }, environment: { id: 2 }, connectSession: connectSessionWithOverride, authType: 'connectSession', endUser: null },
            status: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis()
        } as unknown as Response;
        const next = vi.fn();

        await postPublicAwsSigV4Authorization(req, res, next);

        expect(mockConnectionCreationFailed).toHaveBeenCalledWith(
            expect.objectContaining({
                connection: expect.objectContaining({
                    webhook_url_override: 'https://override.example.com/hook'
                })
            }),
            expect.anything(),
            expect.anything()
        );
    });
});
