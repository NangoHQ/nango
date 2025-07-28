import he from 'he';

import { basePublicUrl } from '@nangohq/utils';

import { EmailClient } from '../clients/email.client.js';

import type { DBInvitation, DBTeam, DBUser } from '@nangohq/types';

export async function sendVerificationEmail(email: string, name: string, token: string) {
    const emailClient = EmailClient.getInstance();
    await emailClient.send(
        email,
        `Verify your email address`,
        `
<p>Hi ${he.encode(name)},</p>

<p>Please verify your account on Nango by clicking <a href="${basePublicUrl}/signup/verification/${token}">${basePublicUrl}/signup/verification/${token}</a></p>

<p>Questions or issues? We are happy to help on the <a href="https://nango.dev/slack">Slack community</a>!</p>

<p>Best,<br>
Team Nango</p>
            `
    );
}

export async function sendResetPasswordEmail({ user, token }: { user: DBUser; token: string }) {
    const emailClient = EmailClient.getInstance();
    await emailClient.send(
        user.email,
        'Nango password reset',
        `<p>Hi ${he.encode(user.name)},</p>

        <p>Someone requested a password reset.</p>
        <p><a href="${basePublicUrl}/reset-password/${token}">Reset password</a></p>
        <p>If you didn't initiate this request, please contact us immediately at support@nango.dev</p>

<p>Best,<br>
Team Nango</p>
            `
    );
}

export async function sendInviteEmail({
    email,
    account,
    user,
    invitation
}: {
    email: string;
    account: DBTeam;
    user: Pick<DBUser, 'name'>;
    invitation: DBInvitation;
}) {
    const emailClient = EmailClient.getInstance();
    await emailClient.send(
        email,
        `You're Invited! Join "${he.encode(account.name)}" on Nango`,
        `<p>Hi,</p>

<p>${he.encode(user.name)} invites you to join "${he.encode(account.name)}" on Nango.</p>

<p>Join this team by clicking <a href="${basePublicUrl}/signup/${invitation.token}">here</a> and completing your signup.</p>

<p>Questions or issues? We are happy to help on the <a href="https://nango.dev/slack">Slack community</a>!</p>

<p>Best,<br>
Team Nango</p>
            `
    );
}

export async function sendTrialAlmostOverEmail({ user, inDays }: { user: Pick<DBUser, 'name' | 'email'>; inDays: number }) {
    const emailClient = EmailClient.getInstance();
    await emailClient.send(
        user.email,
        `Some Nango features will pause in ${inDays} days`,
        `<p>Hi ${he.encode(user.name)},</p>

<p>Some Nango features (syncs & actions) will pause in ${inDays} days. All other features—like authorization flows, credential retrieval, and the proxy—will keep working as usual.</p>

<p>You can delay the idle from the Integrations tab in the <a href="https://app.nango.dev">Nango UI</a>.</p>

<p>We idle syncs & actions because they use dedicated infrastructure, which is too costly to run indefinitely on free plans. <a href="https://app.nango.dev/prod/team/billing">Upgrade</a> to prevent auto idling forever.</p>

<p>Need help or have questions? Join us in the <a href="https://nango.dev/slack">Slack community</a>!</p>

<p>Best,<br>
Team Nango</p>
            `
    );
}

export async function sendTrialHasExpired({ user }: { user: Pick<DBUser, 'name' | 'email'> }) {
    const emailClient = EmailClient.getInstance();
    await emailClient.send(
        user.email,
        `Some Nango features have been paused`,
        `<p>Hi ${he.encode(user.name)},</p>

<p>Some Nango features (syncs & actions) have been paused. All other features—like authorization flows, credential retrieval, and the proxy—still work as usual.</p>

<p>You can reactivate any sync or action in the <a href="https://app.nango.dev">Nango UI</a> for 14 more days.</p>

<p>We idle syncs & actions because they use dedicated infrastructure, which is too costly to run indefinitely on free plans. <a href="https://app.nango.dev/prod/team/billing">Upgrade</a> to prevent auto idling forever.</p>

<p>Need help or have questions? Join us in the <a href="https://nango.dev/slack">Slack community</a>!</p>

<p>Best,<br>
Team Nango</p>
            `
    );
}
