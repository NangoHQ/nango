import { useCallback, useMemo } from 'react';

import { authorizeIn } from '@nangohq/authz';

import { useStore } from '@/store';
import { useMeta } from './useMeta';
import { useUser } from './useUser';

import type { Grant, Principal, Scope } from '@nangohq/authz';
import type { ApiEnvironmentSummary } from '@nangohq/types';

export function usePermissions(): { can: (scope: Scope, inEnvironment?: ApiEnvironmentSummary) => boolean } {
    const { user } = useUser();
    const { data: meta } = useMeta(Boolean(user));
    const env = useStore((s) => s.env);

    const current = meta?.data.environments.find(({ name }) => name === env) ?? null;

    const principal = useMemo<Principal | null>(
        () =>
            user
                ? { subject: { type: 'user', id: String(user.id), display: user.email }, accountId: user.accountId, grants: user.grants as readonly Grant[] }
                : null,
        [user]
    );

    const can = useCallback(
        (scope: Scope, inEnvironment?: ApiEnvironmentSummary) => {
            // `PrivateRoute` renders nothing until the user has landed.
            if (!principal) {
                return false;
            }
            return authorizeIn(principal, scope, inEnvironment ?? current);
        },
        [principal, current]
    );

    return { can };
}
