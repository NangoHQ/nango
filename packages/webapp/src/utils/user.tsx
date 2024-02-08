import storage, { LocalStorageKeys } from '../utils/local-storage';
import { useLogoutAPI } from '../utils/api';
import { useNavigate } from 'react-router';
import { useAnalyticsIdentify, useAnalyticsReset } from './analytics';

export interface User {
    id: number;
    accountId: number;
    email: string;
    name: string;
}

export function isSignedIn() {
    return getUser() !== null;
}

export function useSignin() {
    const analyticsIdentify = useAnalyticsIdentify();

    return (user: User) => {
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
    const logoutAPI = useLogoutAPI();

    return () => {
        storage.clear();
        analyticsReset();
        logoutAPI(); // Destroy server session.
        nav('/signin', { replace: true });
    };
}

export function getUser(): User | null {
    const email = storage.getItem(LocalStorageKeys.UserEmail);
    const name = storage.getItem(LocalStorageKeys.UserName);
    const userId = storage.getItem(LocalStorageKeys.UserId);
    const accountId = storage.getItem(LocalStorageKeys.AccountId);

    if (email && name && userId && accountId) {
        return {
            id: userId,
            email: email,
            name: name,
            accountId: accountId
        };
    } else {
        return null;
    }
}
