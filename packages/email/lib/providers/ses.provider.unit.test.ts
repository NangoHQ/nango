import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SesEmailProvider } from './ses.provider.js';

const mockEnvs = vi.hoisted(() => ({
    AWS_REGION: 'eu-west-1' as string | undefined,
    AWS_SES_CONFIGURATION_SET: undefined as string | undefined,
    SMTP_FROM: 'Nango <noreply@example.com>',
    EMAIL_SES_TIMEOUT_MS: 10_000
}));

vi.mock('../env.js', () => ({ envs: mockEnvs }));

function resetEnvs() {
    mockEnvs.AWS_REGION = 'eu-west-1';
    mockEnvs.AWS_SES_CONFIGURATION_SET = undefined;
    mockEnvs.EMAIL_SES_TIMEOUT_MS = 10_000;
}

describe('SesEmailProvider', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        resetEnvs();
    });

    it('sends a SendEmailCommand with the sender, recipient, subject and HTML body', async () => {
        const sendMock = vi.spyOn(SESv2Client.prototype, 'send').mockResolvedValue({ MessageId: 'abc' } as never);

        await new SesEmailProvider().send('user@example.com', 'Verify your email', '<p>Hi</p>');

        expect(sendMock).toHaveBeenCalledTimes(1);
        const command = sendMock.mock.calls[0]?.[0];
        expect(command).toBeInstanceOf(SendEmailCommand);
        expect((command as SendEmailCommand).input).toStrictEqual({
            FromEmailAddress: 'Nango <noreply@example.com>',
            Destination: { ToAddresses: ['user@example.com'] },
            Content: {
                Simple: {
                    Subject: { Data: 'Verify your email', Charset: 'UTF-8' },
                    Body: { Html: { Data: '<p>Hi</p>', Charset: 'UTF-8' } }
                }
            }
        });
    });

    it('includes the configuration set when one is configured', async () => {
        mockEnvs.AWS_SES_CONFIGURATION_SET = 'nango-transactional';
        const sendMock = vi.spyOn(SESv2Client.prototype, 'send').mockResolvedValue({ MessageId: 'abc' } as never);

        await new SesEmailProvider().send('user@example.com', 'Verify your email', '<p>Hi</p>');

        const command = sendMock.mock.calls[0]?.[0] as SendEmailCommand;
        expect(command.input.ConfigurationSetName).toBe('nango-transactional');
    });

    it('creates the client in AWS_REGION', async () => {
        await expect(new SesEmailProvider()['client'].config.region()).resolves.toBe('eu-west-1');
    });

    it('throws when AWS_REGION is unset', () => {
        mockEnvs.AWS_REGION = undefined;

        expect(() => new SesEmailProvider()).toThrow('AWS_REGION is required to send emails through AWS SES');
    });

    it('passes an abort signal so the send is bounded', async () => {
        const sendMock = vi.spyOn(SESv2Client.prototype, 'send').mockResolvedValue({ MessageId: 'abc' } as never);

        await new SesEmailProvider().send('user@example.com', 'Verify your email', '<p>Hi</p>');

        const options = sendMock.mock.calls[0]?.[1] as { abortSignal?: AbortSignal } | undefined;
        expect(options?.abortSignal).toBeInstanceOf(AbortSignal);
    });

    it('rejects when SES does not answer within EMAIL_SES_TIMEOUT_MS', async () => {
        mockEnvs.EMAIL_SES_TIMEOUT_MS = 20;
        // Stands in for a stalled request: settles only when the SDK aborts it
        vi.spyOn(SESv2Client.prototype, 'send').mockImplementation(((_command: unknown, options?: { abortSignal?: AbortSignal }) => {
            return new Promise((_resolve, reject) => {
                options?.abortSignal?.addEventListener('abort', () => reject(options.abortSignal?.reason as Error));
            });
        }) as never);

        await expect(new SesEmailProvider().send('user@example.com', 'Verify your email', '<p>Hi</p>')).rejects.toMatchObject({ name: 'TimeoutError' });
    });

    it('propagates SES errors', async () => {
        vi.spyOn(SESv2Client.prototype, 'send').mockRejectedValue(new Error('Email address is not verified'));

        await expect(new SesEmailProvider().send('user@example.com', 'Verify your email', '<p>Hi</p>')).rejects.toThrow('Email address is not verified');
    });
});
