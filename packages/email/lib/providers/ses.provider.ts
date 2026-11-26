import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';

import { envs } from '../env.js';

import type { EmailProvider } from '../provider.js';

/**
 * Sends through the AWS SES v2 API. No credentials are passed: the SDK resolves them from the
 * default AWS credential chain (ECS task role, IRSA, instance profile, AWS_* env vars, ...), so
 * deployments that cannot issue SMTP credentials or IAM users can still send email.
 */
export class SesEmailProvider implements EmailProvider<void> {
    private client: SESv2Client;

    constructor() {
        const region = envs.AWS_SES_REGION || envs.AWS_REGION;
        if (!region) {
            throw new Error('AWS_SES_REGION or AWS_REGION is required to send emails through AWS SES');
        }
        this.client = new SESv2Client({ region });
    }

    async send(email: string, subject: string, html: string): Promise<void> {
        await this.client.send(
            new SendEmailCommand({
                FromEmailAddress: envs.SMTP_FROM,
                Destination: { ToAddresses: [email] },
                Content: {
                    Simple: {
                        Subject: { Data: subject, Charset: 'UTF-8' },
                        Body: { Html: { Data: html, Charset: 'UTF-8' } }
                    }
                },
                ...(envs.AWS_SES_CONFIGURATION_SET ? { ConfigurationSetName: envs.AWS_SES_CONFIGURATION_SET } : {})
            })
        );
    }
}
