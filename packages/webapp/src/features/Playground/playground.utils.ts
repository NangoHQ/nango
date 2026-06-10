import { apiFetch } from '@/utils/api';

import type { InputField } from './types';
import type { GetOperation, SearchOperations } from '@nangohq/types';

// --- Input validation ---

function validateConstraints(field: InputField, value: unknown): string | null {
    if (field.enum !== undefined) {
        if (!field.enum.includes(value)) {
            return `Must be one of: ${field.enum.map(String).join(', ')}`;
        }
        return null;
    }
    if (field.type === 'string' && typeof value === 'string') {
        if (field.minLength != null && value.length < field.minLength) {
            return `Must be at least ${field.minLength} character${field.minLength === 1 ? '' : 's'}`;
        }
        if (field.maxLength != null && value.length > field.maxLength) {
            return `Must be at most ${field.maxLength} character${field.maxLength === 1 ? '' : 's'}`;
        }
        if (field.pattern != null) {
            try {
                if (!new RegExp(field.pattern).test(value)) {
                    return `Must match pattern: ${field.pattern}`;
                }
            } catch {
                // Invalid regex pattern in schema — skip constraint
            }
        }
    }
    if ((field.type === 'number' || field.type === 'integer') && typeof value === 'number') {
        if (field.minimum != null && value < field.minimum) return `Must be ≥ ${field.minimum}`;
        if (field.maximum != null && value > field.maximum) return `Must be ≤ ${field.maximum}`;
        if (field.exclusiveMinimum != null && value <= field.exclusiveMinimum) return `Must be > ${field.exclusiveMinimum}`;
        if (field.exclusiveMaximum != null && value >= field.exclusiveMaximum) return `Must be < ${field.exclusiveMaximum}`;
    }
    return null;
}

export type ParseResult = { ok: true; parsed: Record<string, unknown> } | { ok: false; errors: Record<string, string> };

export function validateAndParseInputs(inputFields: InputField[], inputValues: Record<string, string>): ParseResult {
    const parsedInput: Record<string, unknown> = {};
    const errors: Record<string, string> = {};

    for (const field of inputFields) {
        const raw = inputValues[field.name] ?? '';
        const trimmed = raw.trim();

        if (!trimmed) {
            if (field.required) {
                errors[field.name] = 'Required';
            }
            continue;
        }

        let parsed: unknown;
        try {
            switch (field.type) {
                case 'number': {
                    const n = Number(trimmed);
                    if (!Number.isFinite(n)) throw new Error('Expected a number');
                    parsed = n;
                    break;
                }
                case 'integer': {
                    const n = Number(trimmed);
                    if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error('Expected an integer');
                    parsed = n;
                    break;
                }
                case 'boolean': {
                    const v = trimmed.toLowerCase();
                    if (v !== 'true' && v !== 'false') throw new Error('Expected true or false');
                    parsed = v === 'true';
                    break;
                }
                case 'object': {
                    const p = JSON.parse(trimmed);
                    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Expected a JSON object');
                    parsed = p;
                    break;
                }
                case 'array': {
                    const p = JSON.parse(trimmed);
                    if (!Array.isArray(p)) throw new Error('Expected a JSON array');
                    parsed = p;
                    break;
                }
                default:
                    parsed = raw;
            }
        } catch (err) {
            errors[field.name] = err instanceof Error ? err.message : 'Invalid value';
            continue;
        }

        const constraintError = validateConstraints(field, parsed);
        if (constraintError) {
            errors[field.name] = constraintError;
            continue;
        }

        parsedInput[field.name] = parsed;
    }

    if (Object.keys(errors).length > 0) {
        return { ok: false, errors };
    }
    return { ok: true, parsed: parsedInput };
}

// --- Operation fetching ---

export async function fetchOperation(operationId: string, env: string, signal?: AbortSignal): Promise<GetOperation['Success']['data'] | null> {
    const res = await apiFetch(`/api/v1/logs/operations/${encodeURIComponent(operationId)}?env=${env}`, {
        method: 'GET',
        signal
    });
    if (!res.ok) return null;
    const json = (await res.json()) as GetOperation['Success'];
    return json.data;
}

export interface FindOperationParams {
    env: string;
    triggerStartTime: number;
    functionType: 'action' | 'sync';
    integration: string;
    connection: string;
    functionName: string;
}

export async function findOperation(params: FindOperationParams, signal: AbortSignal): Promise<SearchOperations['Success']['data'][number] | null> {
    const { env, triggerStartTime, functionType, integration, connection, functionName } = params;
    const from = new Date(triggerStartTime - 60_000).toISOString();
    const to = new Date().toISOString();

    const body: SearchOperations['Body'] = {
        limit: 25,
        types: [functionType === 'sync' ? 'sync:run' : 'action'],
        integrations: [integration],
        connections: [connection],
        syncs: functionType === 'sync' ? [functionName] : ['all'],
        period: { from, to }
    };

    const res = await apiFetch(`/api/v1/logs/operations?env=${env}`, {
        method: 'POST',
        body: JSON.stringify(body),
        signal
    });

    if (!res.ok) return null;

    const json = (await res.json()) as SearchOperations['Success'];
    if (!json.data || json.data.length === 0) return null;

    const windowStart = triggerStartTime - 15_000;
    const candidates = json.data
        .map((op) => ({ op, ts: new Date(op.createdAt).getTime() }))
        .filter(({ ts, op }) => {
            if (Number.isNaN(ts) || ts < windowStart) return false;
            if (functionType === 'sync' && op.syncConfigName && op.syncConfigName !== functionName) return false;
            return true;
        })
        .sort((a, b) => b.ts - a.ts);

    return candidates[0]?.op ?? null;
}

// --- Result building ---

interface OperationLike {
    meta?: unknown;
    request?: unknown;
    response?: unknown;
    error?: { message: string; payload?: unknown };
}

export function buildResultData(op: OperationLike | null | undefined): unknown {
    if (!op) return null;
    if (!op.meta && !op.request && !op.response && !op.error) return null;

    const pl: Record<string, unknown> = op.meta && typeof op.meta === 'object' ? { ...(op.meta as Record<string, unknown>) } : {};
    if (op.request) pl.request = op.request;
    if (op.response) pl.response = op.response;
    if (op.error) {
        pl.error = { message: op.error.message, ...(op.error.payload ? { payload: op.error.payload } : {}) };
    }
    return pl;
}

export function computeDurationMs(
    op: { durationMs?: number | null; startedAt?: string | null; endedAt?: string | null } | null | undefined,
    fallbackMs?: number
): number {
    if (!op) return fallbackMs ?? 0;
    if (op.durationMs != null && !Number.isNaN(op.durationMs)) return op.durationMs;
    if (op.startedAt && op.endedAt) {
        const d = new Date(op.endedAt).getTime() - new Date(op.startedAt).getTime();
        if (!Number.isNaN(d)) return d;
    }
    return fallbackMs ?? 0;
}

// --- Sleep utility ---

export function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(t);
            reject(new DOMException('Aborted', 'AbortError'));
        };
        const t = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        if (signal.aborted) {
            onAbort();
            return;
        }
        signal.addEventListener('abort', onAbort);
    });
}
