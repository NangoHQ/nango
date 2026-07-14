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
    Theme = 'nango_theme'
}

/**
 * Categorizes each key for logout: 'session' keys are cleared, 'preference'
 * keys (theme) survive. The Record type forces every key to be classified,
 * so a new one can't accidentally skip this decision.
 *
 * Playground lives in sessionStorage, so clearing it here is a no-op; logout
 * resets it separately via resetPlayground() (see useSignout).
 */
const KEY_CATEGORY: Record<LocalStorageKeys, 'session' | 'preference'> = {
    [LocalStorageKeys.UserEmail]: 'session',
    [LocalStorageKeys.UserName]: 'session',
    [LocalStorageKeys.UserId]: 'session',
    [LocalStorageKeys.AccountId]: 'session',
    [LocalStorageKeys.LastEnvironment]: 'session',
    [LocalStorageKeys.Playground]: 'session',
    [LocalStorageKeys.Theme]: 'preference'
};

const storage = new LocalStorage();
export default storage;
