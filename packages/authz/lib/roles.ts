import type { Grant } from './authorize.js';
import type { Role } from '@nangohq/types';

/**
 * Roles as grant sets.
 */
export const ROLES: Record<Role, Grant[]> = {
    administrator: [{ can: ['*'], where: ['*'] }],

    production_support: [
        { can: ['*'], where: ['env:non-production'] },
        {
            can: [
                'environment:integrations:list',
                'environment:integrations:read',
                'environment:connections:list',
                'environment:connections:read',
                'environment:functions:list',
                'environment:functions:read',
                'environment:logs:read',
                'environment:settings:read',
                'account:environments:api_keys:list',
                'environment:syncs:execute' // the playground
            ],
            where: ['env:production']
        },
        { can: ['account:audit_trail:read'], where: ['account'] }
    ],

    development_full_access: [{ can: ['*'], where: ['env:non-production'] }]
};
