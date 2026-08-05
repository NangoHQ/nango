import type { AuditTarget, AuditTargetType } from '@nangohq/audit';

const CHANGED_FIELDS_MAX = 30;
const CHANGED_FIELD_KEY_MAX = 64;

export function toAuditId(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value.length > 0 ? value : undefined;
    }
    return typeof value === 'number' ? String(value) : undefined;
}

export function makeAuditTarget(type: AuditTargetType, value: unknown, display?: string): AuditTarget | undefined {
    const id = toAuditId(value);
    return id ? { type, id, ...(display ? { display } : {}) } : undefined;
}

// Names of the fields present in an input object — never their values, so secrets never leak.
export function changedFields(value: unknown): string[] | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    const keys = Object.keys(value)
        .filter((key) => key.length <= CHANGED_FIELD_KEY_MAX)
        .slice(0, CHANGED_FIELDS_MAX);
    return keys.length > 0 ? keys : undefined;
}
