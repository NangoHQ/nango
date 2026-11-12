import { createFunction } from './function.js';

import type { CreateFunctionProps, CreateFunctionResponse } from './function.js';
import type { ZodCheckpoint, ZodMetadata, ZodModel } from './types.js';
import type { FunctionTags, RequiredScopes, ToolTags } from '@nangohq/types';
import type * as z from 'zod';

type ToolModels = Record<never, ZodModel>;
type ToolTrigger = { kind: 'http' };
type ToolRequires = { outbound: true; connection: true };

function assertUniqueScopes(values: string[]): void {
    if (new Set(values).size !== values.length) {
        throw new Error('Duplicate scopes are not allowed');
    }
}

export const scopes = {
    /** Require every listed provider scope. */
    all(...values: [string, ...string[]]): RequiredScopes {
        assertUniqueScopes(values);
        return { all: values };
    },
    /** Require at least one of the listed provider scopes. */
    any(...values: [string, ...string[]]): RequiredScopes {
        assertUniqueScopes(values);
        return { any: values };
    },
    /** Explicitly declare that no provider scopes are needed. */
    none(): RequiredScopes {
        return { none: true };
    }
};

type ToolFunctionProps<
    TInput extends z.ZodTypeAny,
    TOutput extends z.ZodTypeAny,
    TMetadata extends ZodMetadata,
    TCheckpoint extends ZodCheckpoint
> = CreateFunctionProps<ToolModels, TInput, TOutput, TMetadata, TCheckpoint, ToolTrigger, ToolRequires>;

export interface ToolMeta {
    // How and when an agent should use the tool. Can be long.
    instructions?: string;
    // Provider scopes the connection needs. Currently indicative only; not enforced.
    // Use scopes.all(...) for AND, scopes.any(...) for OR, or scopes.none() for no scopes. Omit when unknown.
    requiredScopes?: RequiredScopes;
    tags?: FunctionTags;
}

export interface CreateToolProps<
    TInput extends z.ZodTypeAny = z.ZodTypeAny,
    TOutput extends z.ZodTypeAny = z.ZodTypeAny,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined
> extends Pick<ToolFunctionProps<TInput, TOutput, TMetadata, TCheckpoint>, 'description' | 'exec'> {
    // Defaults to the file name.
    name?: string;
    input: TInput;
    output: TOutput;
    data?: Omit<NonNullable<ToolFunctionProps<TInput, TOutput, TMetadata, TCheckpoint>['data']>, 'models'>;
    meta?: ToolMeta;
}

export type CreateToolResponse<
    TInput extends z.ZodTypeAny = z.ZodTypeAny,
    TOutput extends z.ZodTypeAny = z.ZodTypeAny,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined
> = CreateFunctionResponse<ToolModels, TInput, TOutput, TMetadata, TCheckpoint, ToolTrigger, ToolRequires> & { name?: string };

/**
 * Create a callable tool. A tool is a function with an http trigger.
 *
 * @example
 * ```ts
 * export default createTool({
 *     description: 'Get a GitHub issue',
 *     input: z.object({ issueNumber: z.number() }),
 *     output: z.object({ title: z.string() }),
 *     meta: { requiredScopes: scopes.any('repo', 'public_repo') },
 *     exec: async (nango, trigger) => {
 *         const issue = await nango.get<{ title: string }>({ endpoint: `/repos/NangoHQ/nango/issues/${trigger.input.issueNumber}` });
 *         return { title: issue.data.title };
 *     }
 * });
 * ```
 */
export function createTool<
    TInput extends z.ZodTypeAny,
    TOutput extends z.ZodTypeAny,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined
>(params: CreateToolProps<TInput, TOutput, TMetadata, TCheckpoint>): CreateToolResponse<TInput, TOutput, TMetadata, TCheckpoint> {
    return { ...createFunction(toolToFunctionProps(params)), ...(params.name !== undefined ? { name: params.name } : {}) };
}

export function toolToFunctionProps<
    TInput extends z.ZodTypeAny,
    TOutput extends z.ZodTypeAny,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined
>(params: CreateToolProps<TInput, TOutput, TMetadata, TCheckpoint>): ToolFunctionProps<TInput, TOutput, TMetadata, TCheckpoint> {
    const data: NonNullable<typeof params.data> = {};
    if (params.data?.metadata !== undefined) data.metadata = params.data.metadata;
    if (params.data?.checkpoint !== undefined) data.checkpoint = params.data.checkpoint;

    return {
        description: params.description,
        input: params.input,
        output: params.output,
        ...(params.data !== undefined ? { data } : {}),
        trigger: { kind: 'http' },
        tags: toolMetaToTags(params.meta),
        exec: params.exec
    };
}

export const reservedToolTagKeys = ['instructions', 'required_scopes'] as const satisfies readonly (keyof ToolTags)[];

function sortScopes(values: [string, ...string[]]): [string, ...string[]] {
    const [first, ...rest] = [...values].sort();
    return [first!, ...rest];
}

function sortedScopes(scopes: RequiredScopes): RequiredScopes {
    if (scopes.all) {
        return { all: sortScopes(scopes.all) };
    }
    if (scopes.any) {
        return { any: sortScopes(scopes.any) };
    }
    return scopes;
}

export function toolMetaToTags(meta: ToolMeta | undefined): ToolTags {
    const tags: ToolTags = { ...meta?.tags };
    if (meta?.instructions !== undefined) {
        tags.instructions = meta.instructions;
    }
    if (meta?.requiredScopes !== undefined) {
        tags.required_scopes = sortedScopes(meta.requiredScopes);
    }
    return tags;
}
