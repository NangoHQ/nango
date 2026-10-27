import { disposableEmailBlocklistSet } from 'disposable-email-domains-js';

const blocklist = disposableEmailBlocklistSet();
blocklist.add('maxxspace.com');

export function isDisposableEmail(email: string): boolean {
    const domain = email.split('@').pop()?.trim().toLowerCase();
    return domain ? blocklist.has(domain) : false;
}
