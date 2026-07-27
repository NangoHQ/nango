export function validateJsonString(value: string): string | null {
    if (!value.trim()) {
        return 'JSON cannot be empty';
    }

    try {
        const parsed = JSON.parse(value);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return 'JSON must be an object';
        }
        return null;
    } catch {
        return 'Invalid JSON';
    }
}

export function parseJsonObject(value: string): Record<string, unknown> {
    return JSON.parse(value) as Record<string, unknown>;
}
