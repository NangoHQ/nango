import { z } from 'zod';

import { legacyFunctionService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { providerConfigKeySchema, scriptNameSchema } from '../helpers/validation.js';

import type { IntegrationFunctionCatalogRow } from '@nangohq/shared';
import type {
    AgentSessionCompiledIntegration,
    AgentSessionCompiledTool,
    AgentSessionCompiledToolset,
    AgentSessionIntegrationPolicy,
    AgentSessionPinnedTools,
    AgentSessionToolsetCompilationErrorCode,
    AgentSessionToolsetPolicy,
    AgentSessionToolsNotInToolsetPayload,
    AgentSessionUnknownIntegrationsPayload,
    AgentSessionUnknownToolsPayload,
    AgentSessionUnsupportedFunctionTypesPayload
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const ALLOW_ALL = '*';

const toolListSchema = z.array(scriptNameSchema);

const toolListSelectorSchema = z.strictObject({ tools: toolListSchema });

const integrationPolicySchema = z
    .union([
        z.literal(ALLOW_ALL),
        z.strictObject({
            allow: z.union([z.literal(ALLOW_ALL), toolListSelectorSchema]).optional(),
            deny: toolListSelectorSchema.optional()
        })
    ])
    .transform((policy): AgentSessionIntegrationPolicy => {
        if (policy === ALLOW_ALL) {
            return { allow: ALLOW_ALL, deny: [] };
        }

        const allow = policy.allow === undefined || policy.allow === ALLOW_ALL ? ALLOW_ALL : policy.allow.tools;

        return { allow, deny: policy.deny?.tools ?? [] };
    });

export const agentSessionToolsetSchema = z.union([
    z.literal(ALLOW_ALL),
    z
        .record(providerConfigKeySchema, integrationPolicySchema)
        .refine((toolset) => Object.keys(toolset).length > 0, { message: 'A toolset must name at least one integration' })
]);

export const agentSessionPinnedToolsSchema = z.record(providerConfigKeySchema, toolListSchema);

export class AgentSessionToolsetCompilationError extends Error {
    public readonly code: AgentSessionToolsetCompilationErrorCode;
    public readonly payload: Record<string, unknown>;

    constructor({ code, message, payload }: { code: AgentSessionToolsetCompilationErrorCode; message: string; payload: Record<string, unknown> }) {
        super(message);
        this.name = 'AgentSessionToolsetCompilationError';
        this.code = code;
        this.payload = payload;
    }
}

/**
 * Evaluates a toolset policy against what the environment actually has deployed and produces
 * the pinned and searchable tool lists the session serves for the rest of its life.
 *
 * An omitted toolset means every integration the tenant resolved a connection for. An explicit
 * `'*'` means every integration in the environment, connected or not, which is the difference
 * between "whatever this tenant has" and "everything we offer".
 */
export async function compileToolset({
    environmentId,
    toolset,
    pinnedTools,
    connectedIntegrations
}: {
    environmentId: number;
    toolset: AgentSessionToolsetPolicy | undefined;
    pinnedTools: AgentSessionPinnedTools | undefined;
    connectedIntegrations: string[];
}): Promise<Result<AgentSessionCompiledToolset, AgentSessionToolsetCompilationError>> {
    const named = namedIntegrations({ toolset, pinnedTools, connectedIntegrations });
    const catalog = await legacyFunctionService.findIntegrationFunctionCatalog({ environmentId, providerConfigKeys: named });

    return compileToolsetFromCatalog({ toolset, pinnedTools, connectedIntegrations, catalog });
}

/**
 * Works out which integrations the policy covers, rejects every name in it the catalog cannot
 * back, filters each integration's actions through its allow and deny lists, and splits what
 * survives into pinned and searchable. Any rejection fails the whole compilation, so a session
 * is either fully valid or not created at all.
 */
export function compileToolsetFromCatalog({
    toolset,
    pinnedTools,
    connectedIntegrations,
    catalog
}: {
    toolset: AgentSessionToolsetPolicy | undefined;
    pinnedTools: AgentSessionPinnedTools | undefined;
    connectedIntegrations: string[];
    catalog: IntegrationFunctionCatalogRow[];
}): Result<AgentSessionCompiledToolset, AgentSessionToolsetCompilationError> {
    const integrations = groupCatalogByIntegration(catalog);

    // Step 1. Resolve which integrations the policy covers.
    const policies = resolvePolicies({ toolset, connectedIntegrations, integrations });
    if (policies.isErr()) {
        return Err(policies.error);
    }

    // Step 2. Fold in the integrations named only by pinned_tools.
    const pinned = new Map(Object.entries(pinnedTools ?? {}).map(([integrationId, tools]) => [integrationId, [...tools]]));
    const unknownIntegrations = [...pinned.keys()].filter((integrationId) => !integrations.has(integrationId));
    if (unknownIntegrations.length > 0) {
        return Err(unknownIntegrationError(unknownIntegrations));
    }

    // Pinning on an integration the toolset never allowed reaches nothing, so it is evaluated
    // against a deny-all policy and comes back out as tool_not_in_toolset.
    for (const integrationId of pinned.keys()) {
        if (!policies.value.has(integrationId)) {
            policies.value.set(integrationId, { allow: [], deny: [] });
        }
    }

    // Step 3. Reject any name the catalog cannot back.
    const referenced = referencedTools({ policies: policies.value, pinned });
    const rejected = rejectUnusableReferences({ referenced, integrations });
    if (rejected) {
        return Err(rejected);
    }

    // Step 4. Filter each integration's actions through its policy and split them into pinned and searchable.
    const compiled = new Map<string, AgentSessionCompiledIntegration>();
    const notInToolset: { integration_id: string; tool: string }[] = [];

    for (const [integrationId, policy] of policies.value) {
        const integration = integrations.get(integrationId);
        if (!integration) {
            continue;
        }

        const allowed = integration.actions.filter((action) => isAllowed(action.name, policy));
        const pinnedNames = new Set(pinned.get(integrationId) ?? []);

        for (const name of pinnedNames) {
            if (!allowed.some((action) => action.name === name)) {
                notInToolset.push({ integration_id: integrationId, tool: name });
            }
        }

        compiled.set(integrationId, {
            provider: integration.provider,
            pinned: allowed.filter((action) => pinnedNames.has(action.name)).map(toCompiledTool),
            searchable: allowed.filter((action) => !pinnedNames.has(action.name)).map(toCompiledTool)
        });
    }

    if (notInToolset.length > 0) {
        return Err(toolNotInToolsetError(notInToolset));
    }

    return Ok(Object.fromEntries(compiled));
}

interface CatalogIntegration {
    provider: string;
    actions: { name: string; description: string }[];
    functionTypesByName: Map<string, string>;
}

interface ToolReference {
    integrationId: string;
    name: string;
}

/**
 * The integrations a policy could possibly touch, or undefined when it could touch any of them
 * and the whole environment has to be loaded.
 */
function namedIntegrations({
    toolset,
    pinnedTools,
    connectedIntegrations
}: {
    toolset: AgentSessionToolsetPolicy | undefined;
    pinnedTools: AgentSessionPinnedTools | undefined;
    connectedIntegrations: string[];
}): string[] | undefined {
    if (toolset === ALLOW_ALL) {
        return undefined;
    }

    const named = toolset === undefined ? connectedIntegrations : Object.keys(toolset);

    // Pinned integrations are loaded too, so that pinning outside the toolset is reported as
    // unknown rather than passing because the integration was never looked up.
    return [...new Set([...named, ...Object.keys(pinnedTools ?? {})])];
}

function resolvePolicies({
    toolset,
    connectedIntegrations,
    integrations
}: {
    toolset: AgentSessionToolsetPolicy | undefined;
    connectedIntegrations: string[];
    integrations: Map<string, CatalogIntegration>;
}): Result<Map<string, AgentSessionIntegrationPolicy>, AgentSessionToolsetCompilationError> {
    const allTools: AgentSessionIntegrationPolicy = { allow: ALLOW_ALL, deny: [] };

    if (toolset === ALLOW_ALL) {
        return Ok(new Map([...integrations.keys()].map((integrationId) => [integrationId, allTools])));
    }

    if (toolset === undefined) {
        return Ok(new Map(connectedIntegrations.map((integrationId) => [integrationId, allTools])));
    }

    const unknown = Object.keys(toolset).filter((integrationId) => !integrations.has(integrationId));
    if (unknown.length > 0) {
        return Err(unknownIntegrationError(unknown));
    }

    return Ok(new Map(Object.entries(toolset)));
}

/**
 * Every tool named explicitly anywhere in the policy. Denied names are checked as strictly as
 * allowed ones: a typo in a deny list silently exposes the tool it was meant to keep out.
 */
function referencedTools({ policies, pinned }: { policies: Map<string, AgentSessionIntegrationPolicy>; pinned: Map<string, string[]> }): ToolReference[] {
    const referenced: ToolReference[] = [];

    for (const [integrationId, policy] of policies) {
        const names = [...(policy.allow === ALLOW_ALL ? [] : policy.allow), ...policy.deny, ...(pinned.get(integrationId) ?? [])];
        for (const name of new Set(names)) {
            referenced.push({ integrationId, name });
        }
    }

    return referenced;
}

/**
 * Classifies every named reference against the catalog and returns the error to fail on, or null
 * when all of them are usable.
 *
 * A name that is deployed but is not an action is reported ahead of one that does not exist at
 * all, since the wrong function type is the more specific thing to hand back. A disabled action
 * counts as unknown, because a session cannot serve it either way.
 */
function rejectUnusableReferences({
    referenced,
    integrations
}: {
    referenced: ToolReference[];
    integrations: Map<string, CatalogIntegration>;
}): AgentSessionToolsetCompilationError | null {
    const unknown: ToolReference[] = [];
    const unsupported: { integrationId: string; name: string; type: string }[] = [];

    for (const reference of referenced) {
        const integration = integrations.get(reference.integrationId);
        if (integration?.actions.some((action) => action.name === reference.name)) {
            continue;
        }

        const type = integration?.functionTypesByName.get(reference.name);
        if (type && type !== 'action') {
            unsupported.push({ ...reference, type });
        } else {
            unknown.push(reference);
        }
    }

    if (unsupported.length > 0) {
        return unsupportedFunctionTypeError(unsupported);
    }

    if (unknown.length > 0) {
        return unknownToolError(unknown);
    }

    return null;
}

function isAllowed(name: string, policy: AgentSessionIntegrationPolicy): boolean {
    if (policy.deny.includes(name)) {
        return false;
    }

    return policy.allow === ALLOW_ALL || policy.allow.includes(name);
}

function groupCatalogByIntegration(catalog: IntegrationFunctionCatalogRow[]): Map<string, CatalogIntegration> {
    const integrations = new Map<string, CatalogIntegration>();

    for (const row of catalog) {
        let integration = integrations.get(row.integration_id);
        if (!integration) {
            integration = { provider: row.provider, actions: [], functionTypesByName: new Map() };
            integrations.set(row.integration_id, integration);
        }

        if (row.name === null || row.type === null) {
            continue;
        }

        integration.functionTypesByName.set(row.name, row.type);

        if (row.type === 'action' && row.enabled) {
            integration.actions.push({ name: row.name, description: row.description ?? row.name });
        }
    }

    return integrations;
}

function toCompiledTool(action: { name: string; description: string }): AgentSessionCompiledTool {
    return { name: action.name, description: action.description };
}

function unknownIntegrationError(rejected: string[]): AgentSessionToolsetCompilationError {
    const payload: AgentSessionUnknownIntegrationsPayload = { integrations: rejected };

    return new AgentSessionToolsetCompilationError({
        code: 'unknown_integration',
        message: `${rejected.length} ${rejected.length === 1 ? 'integration does' : 'integrations do'} not exist in this environment. Check the integration ids in the toolset.`,
        payload: { ...payload }
    });
}

function unknownToolError(rejected: ToolReference[]): AgentSessionToolsetCompilationError {
    const payload: AgentSessionUnknownToolsPayload = {
        tools: rejected.map((reference) => ({ integration_id: reference.integrationId, tool: reference.name }))
    };

    return new AgentSessionToolsetCompilationError({
        code: 'unknown_tool',
        message: `${rejected.length} ${rejected.length === 1 ? 'tool is' : 'tools are'} not a deployed and enabled action on the integration given. Check the tool names, and that the action is enabled.`,
        payload: { ...payload }
    });
}

function unsupportedFunctionTypeError(rejected: { integrationId: string; name: string; type: string }[]): AgentSessionToolsetCompilationError {
    const payload: AgentSessionUnsupportedFunctionTypesPayload = {
        tools: rejected.map((reference) => ({ integration_id: reference.integrationId, tool: reference.name, type: reference.type }))
    };

    return new AgentSessionToolsetCompilationError({
        code: 'unsupported_function_type',
        message: `${rejected.length} ${rejected.length === 1 ? 'name refers' : 'names refer'} to a function that is not an action. Only actions can be exposed as tools.`,
        payload: { ...payload }
    });
}

function toolNotInToolsetError(rejected: { integration_id: string; tool: string }[]): AgentSessionToolsetCompilationError {
    const payload: AgentSessionToolsNotInToolsetPayload = { pinned: rejected };

    return new AgentSessionToolsetCompilationError({
        code: 'tool_not_in_toolset',
        message: `${rejected.length} pinned ${rejected.length === 1 ? 'tool is' : 'tools are'} not allowed by the toolset. Pinning controls what the agent sees first, not what it may reach, so allow the tool in the toolset as well.`,
        payload: { ...payload }
    });
}
