import { createFunction } from './function.js';

import type { CreateFunctionProps, CreateFunctionResponse, Nango } from './function.js';
import type { ZodModel } from './types.js';
import type { FunctionTags, MaybePromise, ToolTags, Trigger } from '@nangohq/types';
import type * as z from 'zod';

type ToolModels = Record<never, ZodModel>;
type ToolTrigger = { kind: 'http' };
type ToolRequires = { outbound: true; connection: true };

export interface ToolMeta {
    // How and when an agent should use the tool. Can be long.
    instructions?: string;
    // Provider scopes the connection needs for the tool to work.
    requiredScopes?: string[];
    tags?: FunctionTags;
}

export interface CreateToolProps<TInput extends z.ZodTypeAny = z.ZodTypeAny, TOutput extends z.ZodTypeAny = z.ZodTypeAny> {
    // Defaults to the file name.
    name?: string;
    description: string;
    input: TInput;
    output: TOutput;
    meta?: ToolMeta;
    exec: (nango: Nango<ToolModels, undefined, undefined, ToolRequires>, trigger: Trigger<ToolTrigger, z.infer<TInput>>) => MaybePromise<z.infer<TOutput>>;
}

export type CreateToolResponse<TInput extends z.ZodTypeAny = z.ZodTypeAny, TOutput extends z.ZodTypeAny = z.ZodTypeAny> = CreateFunctionResponse<
    ToolModels,
    TInput,
    TOutput,
    undefined,
    undefined,
    ToolTrigger,
    ToolRequires
> & { name?: string };

/**
 * Create a tool an agent can call. A tool is a function with an http trigger.
 *
 * @example
 * ```ts
 * export default createTool({
 *     description: 'Get a GitHub issue',
 *     input: z.object({ issueNumber: z.number() }),
 *     output: z.object({ title: z.string() }),
 *     meta: { requiredScopes: ['repo'] },
 *     exec: async (nango, trigger) => {
 *         const issue = await nango.get<{ title: string }>({ endpoint: `/repos/NangoHQ/nango/issues/${trigger.input.issueNumber}` });
 *         return { title: issue.title };
 *     }
 * });
 * ```
 */
export function createTool<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny>(
    params: CreateToolProps<TInput, TOutput>
): CreateToolResponse<TInput, TOutput> {
    return { ...createFunction(toolToFunctionProps(params)), ...(params.name !== undefined ? { name: params.name } : {}) };
}

export function toolToFunctionProps<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny>(
    params: CreateToolProps<TInput, TOutput>
): CreateFunctionProps<ToolModels, TInput, TOutput, undefined, undefined, ToolTrigger, ToolRequires> {
    return {
        description: params.description,
        input: params.input,
        output: params.output,
        trigger: { kind: 'http' },
        tags: toolMetaToTags(params.meta),
        exec: params.exec
    };
}

export const reservedToolTagKeys = ['instructions', 'required_scopes'] as const satisfies readonly (keyof ToolTags)[];

export function toolMetaToTags(meta: ToolMeta | undefined): ToolTags {
    const tags: ToolTags = { ...meta?.tags };
    if (meta?.instructions !== undefined) {
        tags.instructions = meta.instructions;
    }
    if (meta?.requiredScopes !== undefined) {
        tags.required_scopes = meta.requiredScopes;
    }
    return tags;
}
