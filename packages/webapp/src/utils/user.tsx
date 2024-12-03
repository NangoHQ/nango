import storage, { LocalStorageKeys } from '../utils/local-storage';
import { useLogoutAPI } from '../utils/api';
import { useAnalyticsIdentify, useAnalyticsReset } from './analytics';
import { useSWRConfig } from 'swr';
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

export function useSignout() {
    const analyticsReset = useAnalyticsReset();
    //const nav = useNavigate();
    const { mutate, cache } = useSWRConfig();
    const logoutAPI = useLogoutAPI();

    return async () => {
        storage.clear();
        analyticsReset();
        await logoutAPI(); // Destroy server session.

        await mutate(() => true, undefined, { revalidate: false }); // clean all cache

        // swr/infinite doesn't currently support clearing cache keys with the
        // default mechanism. see https://github.com/vercel/swr/issues/2497
        for (const key of cache.keys()) {
            await mutate(key, undefined, { revalidate: false });
        }

        window.ko?.reset();

        // force a full reload to ensure all state is cleared
        window.location.href = '/signin';
    };
}
