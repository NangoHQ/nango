interface PersistentStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: any): void;
}

class LocalStorage implements PersistentStorage {
    getItem(key: string): any {
        const item = localStorage.getItem(key);

        if (item === null) return undefined;
        if (item === 'null') return null;
        if (item === 'undefined') return undefined;

        try {
            return JSON.parse(item);
        } catch {
            console.error('Failed to parse local storage', item);
        }

        return item;
    }

    setItem(key: string, value: any) {
        if (!value) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, JSON.stringify(value));
        }
    }

    /**
     * Remove session-scoped data on logout. Preferences such as theme and
     * feature flags are stored in localStorage too but must survive logout, so
     * we remove only the keys classified as 'session' in KEY_CATEGORY rather
     * than wiping everything (the previous `localStorage.clear()`).
     */
    clearSession() {
        for (const [key, category] of Object.entries(KEY_CATEGORY)) {
            if (category === 'session') {
                localStorage.removeItem(key);
            }
        }
    }
}

export enum LocalStorageKeys {
    UserEmail = 'nango_user_email',
    UserName = 'nango_user_name',
    UserId = 'nango_user_id',
    AccountId = 'nango_account_id',
    LastEnvironment = 'nango_last_environment',
    Playground = 'nango_playground',
    FeatureFlags = 'nango_feature_flags',
    Theme = 'nango_theme'
}

/**
 * Classifies every localStorage key so logout knows what to remove:
 *   - 'session'    — data tied to the signed-in user; cleared on logout.
 *   - 'preference' — user/device preferences; preserved across logout.
 *
 * Typing this as `Record<LocalStorageKeys, ...>` makes it a compile-time guard:
 * adding a new key to the enum without categorizing it here breaks the build,
 * so logout can never silently wipe a preference or retain stale session data.
 *
 * `Playground` is persisted to sessionStorage (see store/playground.ts), so
 * removing it from localStorage on logout is a no-op. Whether logout should also
 * reset the sessionStorage playground state is an open question, intentionally
 * left as-is for now.
 */
const KEY_CATEGORY: Record<LocalStorageKeys, 'session' | 'preference'> = {
    [LocalStorageKeys.UserEmail]: 'session',
    [LocalStorageKeys.UserName]: 'session',
    [LocalStorageKeys.UserId]: 'session',
    [LocalStorageKeys.AccountId]: 'session',
    [LocalStorageKeys.LastEnvironment]: 'session',
    [LocalStorageKeys.Playground]: 'session',
    [LocalStorageKeys.FeatureFlags]: 'preference',
    [LocalStorageKeys.Theme]: 'preference'
};

const storage = new LocalStorage();
export default storage;
