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
        } catch {}

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
    Authorized = 'nango_authorized'
}

const storage = new LocalStorage();
export default storage;
