import type { DBEnvironment } from '@nangohq/types';

export type WhereSelector = 'account' | 'env:*' | 'env:production' | 'env:non-production' | `env:${number}`;

export type Target = { type: 'account'; accountId: number } | { type: 'environment'; accountId: number; environment: { id: number; is_production: boolean } };

export function accountTarget(accountId: number): Target {
    return { type: 'account', accountId };
}

/** Takes the environment row so the account can't be named independently of it. */
export function environmentTarget(environment: Pick<DBEnvironment, 'id' | 'account_id' | 'is_production'>): Target {
    return { type: 'environment', accountId: environment.account_id, environment: { id: environment.id, is_production: environment.is_production } };
}

export function whereContains(where: WhereSelector, target: Target): boolean {
    if (target.type === 'account') {
        return where === 'account';
    }
    switch (where) {
        case 'account':
            return false;
        case 'env:*':
            return true;
        case 'env:production':
            return target.environment.is_production;
        case 'env:non-production':
            return !target.environment.is_production;
        default:
            return Number(where.slice('env:'.length)) === target.environment.id;
    }
}

/**
 * A selector a customer credential may hold.
 * Multi-environment selectors expand when new environments are created, or the environment's `is_production` is changed.
 */
export function isIssuableWhere(where: WhereSelector): boolean {
    return where !== 'env:*' && where !== 'env:production' && where !== 'env:non-production';
}
