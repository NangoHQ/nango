import { userQueryKey } from '../hooks/useUser';
import { queryClient } from '../store';
import { resetPlayground } from '../store/playground';
import storage, { LocalStorageKeys } from '../utils/local-storage';
import { resetAnalytics, useAnalyticsIdentify } from './analytics';
import { apiFetch } from './api';
import { signinPathWithNext } from './routes';

import type { ApiUser } from '@nangohq/types';

export function useSignin() {
    const analyticsIdentify = useAnalyticsIdentify();

    return (user: ApiUser) => {
        storage.setItem(LocalStorageKeys.UserEmail, user.email);
        storage.setItem(LocalStorageKeys.UserName, user.name);
        storage.setItem(LocalStorageKeys.UserId, user.id);
        storage.setItem(LocalStorageKeys.AccountId, user.accountId);

        analyticsIdentify(user);
    };
}

let signingOut = false;

// Keep this callable outside React: the query client's 401 handler has no component to call a hook from.
export async function signout({ expired = false }: { expired?: boolean } = {}) {
    // No user loaded in this tab means a signed-out visitor, not an expiry.
    if (expired && !queryClient.getQueryData(userQueryKey)) {
        return;
    }

    // Every query on the page fails with the same 401. Without this, each one logs out and redirects.
    if (signingOut) {
        return;
    }
    signingOut = true;

    // Read before the first await. Once React re-renders, PrivateRoute has already moved the page to /signin.
    const target = expired ? signinPathWithNext(window.location, { expired: true }) : '/signin';

    storage.clearSession();
    resetPlayground(); // playground selections belong to the session's account/env
    resetAnalytics();

    try {
        await apiFetch('/api/v1/account/logout', { method: 'POST' });
    } catch {
        // The user still has to reach the signin page when the logout request fails.
    }

    await queryClient.cancelQueries();
    queryClient.clear();

    // force a full reload to ensure all state is cleared
    window.location.href = target;
}

export function useSignout() {
    return signout;
}
