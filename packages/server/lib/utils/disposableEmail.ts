import { disposableEmailBlocklistSet } from 'disposable-email-domains-js';

const extraDomains = ['maxxspace.com'];

const blocklist = new Set([...disposableEmailBlocklistSet(), ...extraDomains]);

export function isDisposableEmail(email: string): boolean {
    const labels = email.split('@').pop()?.trim().toLowerCase().split('.') ?? [];
    // Throwaway services hand out subdomains of a listed domain, which an exact match misses.
    for (let i = 0; i < labels.length - 1; i++) {
        if (blocklist.has(labels.slice(i).join('.'))) {
            return true;
        }
    }
    return false;
}
