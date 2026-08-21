import he from 'he';

import { EmailClient } from '@nangohq/email';
import { basePublicUrl } from '@nangohq/utils';

import type { DBInvitation, DBTeam, DBUser } from '@nangohq/types';

export function sanitizeEmailSubject(subject: string): string {
    return subject.replace(/[\r\n]+/g, ' ');
}

// Encoding matters: URLSearchParams.get() turns "+" into a space, so a plus-addressed email
// would come back malformed and the dashboard would silently drop the prefill.
export function buildInvitePrefillUrl(email: string): string {
    return `${basePublicUrl}/team-settings?invite_email=${encodeURIComponent(email)}`;
}

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
    invitation,
    isExistingUser = false
}: {
    email: string;
    account: DBTeam;
    user: Pick<DBUser, 'name'>;
    invitation: DBInvitation;
    isExistingUser?: boolean;
}) {
    const emailClient = EmailClient.getInstance();
    const inviteLink = isExistingUser ? `${basePublicUrl}/signin?next=/signup/${invitation.token}` : `${basePublicUrl}/signup/${invitation.token}`;
    const callToAction = isExistingUser
        ? `Log in to accept the invitation by clicking <a href="${inviteLink}">here</a>.`
        : `Join this team by clicking <a href="${inviteLink}">here</a> and completing your signup.`;

    await emailClient.send(
        email,
        sanitizeEmailSubject(`You're Invited! Join "${account.name}" on Nango`),
        `<p>Hi,</p>

<p>${he.encode(user.name)} invites you to join "${he.encode(account.name)}" on Nango.</p>

<p>${callToAction}</p>

<p>Questions or issues? We are happy to help on the <a href="https://nango.dev/slack">Slack community</a>!</p>

<p>Best,<br>
Team Nango</p>
            `
    );
}

export async function sendAccountInvitationRequestEmail({
    email,
    account,
    requester
}: {
    email: string;
    account: Pick<DBTeam, 'name'>;
    requester: Pick<DBUser, 'name' | 'email'>;
}) {
    const emailClient = EmailClient.getInstance();
    const inviteUrl = buildInvitePrefillUrl(requester.email);
    await emailClient.send(
        email,
        sanitizeEmailSubject(`${requester.name} wants to join "${account.name}" on Nango`),
        `<p>Hi,</p>

<p><strong>${he.encode(requester.name)}</strong> (${he.encode(requester.email)}) has requested to join <strong>${he.encode(account.name)}</strong> on Nango.</p>

<p>Their email address has been verified.</p>

<p><a href="${he.encode(inviteUrl)}">Invite them to your team</a></p>

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

/** Falls back to a bare amount when Orb states no currency, rather than dropping the figure. */
function formatAmount(amountInCents: number, currency: string | null): string {
    const amount = amountInCents / 100;
    const code = (currency ?? '').trim().toUpperCase();
    // Intl throws on anything that isn't a currency code, and Orb also reports the literal
    // `credits`, so the code is checked rather than trusted.
    if (!/^[A-Z]{3}$/.test(code)) {
        return amount.toFixed(2);
    }

    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount);
}

/** In UTC: billing period boundaries are UTC instants, so a local-time formatter can name the wrong day. */
function formatPeriodEnd(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export async function sendSpendAlertEmail({
    email,
    accountName,
    thresholdInCents,
    currency,
    periodEnd
}: {
    email: string;
    accountName: string;
    thresholdInCents: number;
    currency: string | null;
    periodEnd: Date;
}) {
    const emailClient = EmailClient.getInstance();
    const threshold = formatAmount(thresholdInCents, currency);

    await emailClient.send(
        email,
        sanitizeEmailSubject(`Nango spend for "${accountName}" has passed ${threshold}`),
        `<p>Hi,</p>

<p>Spend for <strong>${he.encode(accountName)}</strong> has passed its ${he.encode(threshold)} spend alert. The current billing period ends on ${he.encode(formatPeriodEnd(periodEnd))}, and usage keeps accruing until then.</p>

<p>See the breakdown on the <a href="${basePublicUrl}/team/billing">billing page</a>.</p>

<p>This alert goes to the billing contacts and admins on the account. The threshold can be changed or removed from the same page.</p>

<p>Best,<br>
Team Nango</p>
            `
    );
}
