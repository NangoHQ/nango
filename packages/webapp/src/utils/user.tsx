import storage, { LocalStorageKeys } from '../utils/local-storage';
import { usePostHog } from 'posthog-js/react';
import { useLogoutAPI } from '../utils/api';
import { useNavigate } from 'react-router';

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
    const posthog = usePostHog();

    return (user: User) => {
        storage.setItem(LocalStorageKeys.UserEmail, user.email);
        storage.setItem(LocalStorageKeys.UserName, user.name);
        storage.setItem(LocalStorageKeys.UserId, user.id);
        storage.setItem(LocalStorageKeys.AccountId, user.accountId);

        posthog?.identify(user.email, {
            email: user.email,
            name: user.name,
            userId: user.id,
            accountId: user.accountId
        });

        posthog?.group('company', `${user.accountId}`);
    };
}

export function useSignout() {
    const posthog = usePostHog();
    const nav = useNavigate();
    const logoutAPI = useLogoutAPI();

    return () => {
        storage.clear();
        posthog?.reset();
        logoutAPI(); // Destroy server session.
        nav('/signin', { replace: true });
    };
}

export function getUser(): User | null {
    let email = storage.getItem(LocalStorageKeys.UserEmail);
    let name = storage.getItem(LocalStorageKeys.UserName);
    let userId = storage.getItem(LocalStorageKeys.UserId);
    let accountId = storage.getItem(LocalStorageKeys.AccountId);

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
