import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SesEmailProvider } from './ses.provider.js';

const mockEnvs = vi.hoisted(() => ({
    AWS_SES_REGION: 'eu-west-1' as string | undefined,
    AWS_REGION: undefined as string | undefined,
    AWS_SES_CONFIGURATION_SET: undefined as string | undefined,
    SMTP_FROM: 'Nango <noreply@example.com>'
}));

vi.mock('../env.js', () => ({ envs: mockEnvs }));

function resetEnvs() {
    mockEnvs.AWS_SES_REGION = 'eu-west-1';
    mockEnvs.AWS_REGION = undefined;
    mockEnvs.AWS_SES_CONFIGURATION_SET = undefined;
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

    it('uses AWS_SES_REGION over AWS_REGION', async () => {
        mockEnvs.AWS_REGION = 'us-east-1';

        await expect(new SesEmailProvider()['client'].config.region()).resolves.toBe('eu-west-1');
    });

    it('falls back to AWS_REGION when AWS_SES_REGION is unset', async () => {
        mockEnvs.AWS_SES_REGION = undefined;
        mockEnvs.AWS_REGION = 'us-east-1';

        await expect(new SesEmailProvider()['client'].config.region()).resolves.toBe('us-east-1');
    });

    it('throws when no region is configured', () => {
        mockEnvs.AWS_SES_REGION = undefined;

        expect(() => new SesEmailProvider()).toThrow('AWS_SES_REGION or AWS_REGION is required to send emails through AWS SES');
    });

    it('propagates SES errors', async () => {
        vi.spyOn(SESv2Client.prototype, 'send').mockRejectedValue(new Error('Email address is not verified'));

        await expect(new SesEmailProvider().send('user@example.com', 'Verify your email', '<p>Hi</p>')).rejects.toThrow('Email address is not verified');
    });
});
