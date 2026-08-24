export type WhereSelector = '*' | 'account' | 'env:*' | 'env:production' | 'env:non-production' | `env:${number}`;

export type Target = { type: 'account' } | { type: 'environment'; environment: { id: number; is_production: boolean } };

export function whereContains(where: WhereSelector, target: Target): boolean {
    if (where === '*') {
        return true;
    }
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
    return where !== '*' && where !== 'env:*' && where !== 'env:production' && where !== 'env:non-production';
}
