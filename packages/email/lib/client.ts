import { EMAIL_PROVIDER_ENVS, EMAIL_PROVIDERS } from '@nangohq/utils';

import { envs } from './env.js';
import { logger } from './logger.js';
import { HttpEmailProvider } from './providers/http.provider.js';
import { MailgunEmailProvider } from './providers/mailgun.provider.js';
import { NoEmailProvider } from './providers/no-email.provider.js';
import { SesEmailProvider } from './providers/ses.provider.js';
import { SmtpEmailProvider } from './providers/smtp.provider.js';

import type { EmailProvider } from './provider.js';
import type { EmailProviderName, EmailProviderRequiredEnv } from '@nangohq/utils';

type ProviderEnvs = Pick<typeof envs, 'EMAIL_PROVIDER' | EmailProviderRequiredEnv>;

/**
 * EMAIL_PROVIDER wins when set. Otherwise the provider is inferred the way it always was, so
 * self-hosted deployments upgrade without config changes. Which providers can be inferred, and in
 * what order, is defined by EMAIL_PROVIDERS and EMAIL_PROVIDER_ENVS.
 */
export function resolveEmailProvider(providerEnvs: ProviderEnvs): { provider: EmailProviderName; ignored: EmailProviderName[] } {
    if (providerEnvs.EMAIL_PROVIDER) {
        return { provider: providerEnvs.EMAIL_PROVIDER, ignored: [] };
    }

    const configured = EMAIL_PROVIDERS.filter((name) => {
        const { required, inferred }: { required: readonly EmailProviderRequiredEnv[]; inferred: boolean } = EMAIL_PROVIDER_ENVS[name];
        return inferred && required.every((env) => providerEnvs[env]);
    });

    const [provider = 'none', ...ignored] = configured;
    return { provider, ignored };
}

function createProvider(name: EmailProviderName): EmailProvider<unknown> {
    switch (name) {
        case 'mailgun':
            return new MailgunEmailProvider();
        case 'smtp':
            return new SmtpEmailProvider();
        case 'ses':
            return new SesEmailProvider();
        case 'http':
            // EMAIL_HTTP_BODY is guaranteed alongside the URL: ENVS rejects one without the other,
            // so a half-configured HTTP provider fails at startup rather than on the first email.
            return new HttpEmailProvider();
        case 'none':
            return new NoEmailProvider();
    }
}

export class EmailClient {
    private static instance: EmailClient | undefined;
    private provider: EmailProvider<unknown>;

    private constructor() {
        const { provider, ignored } = resolveEmailProvider(envs);
        if (ignored.length > 0) {
            logger.warning(
                `Several email providers are configured; sending with "${provider}" and ignoring ${ignored.map((name) => `"${name}"`).join(', ')}. Set EMAIL_PROVIDER to choose explicitly.`
            );
        }
        this.provider = createProvider(provider);
    }

    static getInstance() {
        if (!EmailClient.instance) {
            EmailClient.instance = new EmailClient();
        }
        return EmailClient.instance;
    }

    send(email: string, subject: string, html: string) {
        return this.provider.send(email, subject, html);
    }
}
