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

interface SignoutOptions {
    expired?: boolean;
    /** Where the user was when the session died. PrivateRoute has already redirected to /signin by the time this runs. */
    from?: { pathname: string; search: string; hash: string };
}

// Not a hook: the query client's 401 handler calls this from outside React.
export async function signout({ expired = false, from }: SignoutOptions = {}) {
    // The homepage's five insight charts fail together; without this each one logs out and redirects.
    if (signingOut) {
        return;
    }
    signingOut = true;

    const target = expired ? signinPathWithNext(from ?? window.location, { expired: true }) : '/signin';

    storage.clearSession();
    resetPlayground(); // playground selections belong to the session's account/env
    resetAnalytics();

    try {
        await apiFetch('/api/v1/account/logout', { method: 'POST' });
    } catch {
        // An expired session cannot destroy itself, and the user still has to reach the signin page.
    }

    await queryClient.cancelQueries();
    queryClient.clear();

    // force a full reload to ensure all state is cleared
    window.location.href = target;
}

export function useSignout() {
    return signout;
}
