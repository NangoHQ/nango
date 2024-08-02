import storage, { LocalStorageKeys } from '../utils/local-storage';
import { useLogoutAPI } from '../utils/api';
import { useNavigate } from 'react-router-dom';
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
    const nav = useNavigate();
    const { mutate } = useSWRConfig();
    const logoutAPI = useLogoutAPI();

    return async () => {
        storage.clear();
        analyticsReset();
        await logoutAPI(); // Destroy server session.

        await mutate(() => true, undefined, { revalidate: false }); // clean all cache
        nav('/signin', { replace: true });
    };
}
