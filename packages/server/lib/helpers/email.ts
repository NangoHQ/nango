import { basePublicUrl } from '@nangohq/utils';
import EmailClient from '../clients/email.client.js';

export function sendVerificationEmail(email: string, name: string, token: string) {
    const emailClient = EmailClient.getInstance();
    emailClient.send(
        email,
        `Verify your email address`,
        `
<p>Hi ${name},</p>

<p>We need to verify your email address ${email}</p>

<p>Please verify this account by clicking <a href="${basePublicUrl}/signup/verification/${token}">here</a></p>

<p>Questions or issues? We are happy to help on the <a href="https://nango.dev/slack">Slack community</a>!</p>

<p>Best,<br>
Team Nango</p>
            `
    );
}
