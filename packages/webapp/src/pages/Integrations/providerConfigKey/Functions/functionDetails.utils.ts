import { toFunctionSchemas } from '@/features/Functions/schemas';
import { buildPullCommand, isRunnableFunction, isSyncOrAction } from '@/utils/scripts';

import type { FunctionSchemas } from '@/features/Functions/schemas';
import type { FunctionListSource, FunctionListType, FunctionType, ListedNangoFunction, NangoFunctionTemplate } from '@nangohq/types';

export type DetailsFunction = ListedNangoFunction | NangoFunctionTemplate;

export interface FunctionDetails extends FunctionSchemas {
    name: string;
    description?: string;
    source: FunctionListSource | 'template';
    scopes: string[];
    scopesMatch: 'all' | 'any';
    frequency: string | null;
    pullCommand: string;
    runType: 'sync' | 'action' | 'tool' | null;
    delete: { type: 'sync' | 'action'; description: string } | undefined;
    code: { kind: 'deployed'; type: FunctionListType } | { kind: 'template'; type: FunctionType };
}

export function toFunctionDetails(
    fn: DetailsFunction,
    { env, integration, provider }: { env: string; integration: string; provider: string }
): FunctionDetails {
    const listed = 'enabled' in fn;
    const deleteType = listed && fn.source !== 'repo' && fn.id != null && isSyncOrAction(fn) ? fn.type : undefined;
    const base = {
        name: fn.name,
        description: fn.description,
        source: listed ? fn.source : ('template' as const),
        frequency: fn.type === 'sync' ? fn.runs : null,
        runType: listed && fn.enabled && isRunnableFunction(fn) ? fn.type : null,
        delete: deleteType && {
            type: deleteType,
            description:
                deleteType === 'sync'
                    ? `You are about to permanently delete the sync "${fn.name}" and all of its synced records. This operation is not reversible, are you sure you wish to continue?`
                    : `You are about to permanently delete the tool "${fn.name}". This operation is not reversible, are you sure you wish to continue?`
        },
        ...toFunctionSchemas(fn)
    };
    if (fn.type === 'tool') {
        const requiredScopes = fn.meta.required_scopes;
        return {
            ...base,
            scopes: requiredScopes?.all ?? requiredScopes?.any ?? [],
            scopesMatch: requiredScopes?.any ? 'any' : 'all',
            pullCommand: buildPullCommand({ integration, name: fn.name, type: 'tool', source: { env } }),
            code: { kind: 'deployed', type: 'tool' }
        };
    }
    return {
        ...base,
        scopes: fn.scopes ?? [],
        scopesMatch: 'all',
        pullCommand: buildPullCommand({ integration, name: fn.name, type: fn.type, source: listed ? { env } : { catalog: true, provider } }),
        code: listed ? { kind: 'deployed', type: fn.type } : { kind: 'template', type: fn.type }
    };
}
