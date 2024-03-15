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

    clear() {
        localStorage.clear();
    }
}

export enum LocalStorageKeys {
    UserEmail = 'nango_user_email',
    UserName = 'nango_user_name',
    UserId = 'nango_user_id',
    AccountId = 'nango_account_id'
}

const storage = new LocalStorage();
export default storage;
