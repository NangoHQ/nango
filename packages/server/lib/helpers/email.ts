import { basePublicUrl } from '@nangohq/utils';
import EmailClient from '../clients/email.client.js';

export function sendVerificationEmail(email: string, name: string, token: string) {
    const emailClient = EmailClient.getInstance();
    emailClient.send(
        email,
        `Verify your email address`,
        `
<p>Hi ${name},</p>

<p>Please verify your account on Nango by clicking <a href="${basePublicUrl}/signup/verification/${token}">${basePublicUrl}/signup/verification/${token}</a></p>

<p>Questions or issues? We are happy to help on the <a href="https://nango.dev/slack">Slack community</a>!</p>

<p>Best,<br>
Team Nango</p>
            `
    );
}
