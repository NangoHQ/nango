import { z } from 'zod';

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { createdAgentSessionToPublicApi } from '../../formatters/agentSession.js';
import { connectionIdSchema, connectionTagsSchema, providerConfigKeySchema, TAG_MAX_COUNT } from '../../helpers/validation.js';
import * as agentSessionService from '../../services/agentSession.service.js';
import { trackAgentSessionCreated } from '../../services/agentSessionAnalytics.service.js';
import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';

import type {
    AgentSessionCreationErrorPayload,
    AgentSessionIntegrationPolicy,
    AgentSessionMetaTools,
    AgentSessionMetaToolsSummary,
    AgentSessionTenantConnections,
    PostAgentSessions
} from '@nangohq/types';

export const MAX_SELECTORS = 10;

const ALLOW_ALL = '*';

const MIN_EXPIRES_IN_MS = 60 * 1000;
const MAX_EXPIRES_IN_MS = 15 * 24 * 60 * 60 * 1000;

const EXPIRES_IN_PATTERN = /^([1-9]\d*)([smhd])$/;

const EXPIRES_IN_UNITS_IN_MS: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
};

/** One slot is spent on the tag binding the connection back to the session, so the caller gets the rest. */
const MAX_CONFIGURED_TAGS = TAG_MAX_COUNT - 1;

const selectorSchema = z.strictObject({
    tags: connectionTagsSchema.refine((tags) => Object.keys(tags).length > 0, {
        message: 'A connection selector must carry at least one tag'
    })
});

export const agentSessionTenantConnectionsSchema = z
    .strictObject({
        any: z.array(selectorSchema).max(MAX_SELECTORS).optional(),
        pinned: z
            .array(
                z.strictObject({
                    integration_id: providerConfigKeySchema,
                    connection_id: connectionIdSchema
                })
            )
            .refine((pinned) => new Set(pinned.map((pin) => pin.integration_id)).size === pinned.length, {
                message: 'Only one connection can be pinned per integration'
            })
            .optional()
    })
    .refine((connections) => (connections.any?.length ?? 0) > 0 || (connections.pinned?.length ?? 0) > 0, {
        message: 'Provide at least one connection selector in any, or at least one pinned connection'
    })
    .transform(
        (connections): AgentSessionTenantConnections => ({
            any: (connections.any ?? []).map((selector) => ({ tags: selector.tags })),
            pinned: (connections.pinned ?? []).map((pin) => ({
                integrationId: pin.integration_id,
                connectionId: pin.connection_id
            }))
        })
    );

// An MCP tool name may also carry dots, which no deployed action name can.
const toolNameSchema = z
    .string()
    .regex(/^[a-zA-Z0-9_.-]+$/)
    .max(255);

const toolListSchema = z.array(toolNameSchema);

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

const asMetaToolConfig = (value: unknown) => (typeof value === 'boolean' ? { enabled: value } : value);

const metaToolSchema = z.preprocess(asMetaToolConfig, z.strictObject({ enabled: z.boolean() }));

const createConnectionMetaToolSchema = z.preprocess(
    asMetaToolConfig,
    z.strictObject({
        enabled: z.boolean(),
        tags: connectionTagsSchema
            .refine((tags) => Object.keys(tags).length <= MAX_CONFIGURED_TAGS, {
                message: `Cannot configure more than ${MAX_CONFIGURED_TAGS} tags`
            })
            .optional()
    })
);

const metaToolsShape = {
    nango_tool_search: metaToolSchema.optional(),
    nango_execute: metaToolSchema.optional(),
    nango_proxy: metaToolSchema.optional(),
    nango_create_connection: createConnectionMetaToolSchema.optional()
} satisfies Record<keyof AgentSessionMetaToolsSummary, z.ZodType>;

const META_TOOL_NAMES = Object.keys(metaToolsShape);

/**
 * Unknown keys pass validation so they can be rejected as unknown_meta_tool, which names them,
 * instead of a generic invalid_body.
 */
export const agentSessionMetaToolsSchema = z.looseObject(metaToolsShape).transform((requested) => {
    const metaTools: Partial<AgentSessionMetaTools> = {
        ...(requested.nango_tool_search && { nangoToolSearch: requested.nango_tool_search.enabled }),
        ...(requested.nango_execute && { nangoExecute: requested.nango_execute.enabled }),
        ...(requested.nango_proxy && { nangoProxy: requested.nango_proxy.enabled }),
        ...(requested.nango_create_connection && {
            nangoCreateConnection: { enabled: requested.nango_create_connection.enabled, tags: requested.nango_create_connection.tags ?? {} }
        })
    };

    return { metaTools, unknown: Object.keys(requested).filter((key) => !META_TOOL_NAMES.includes(key)) };
});

export const agentSessionExpiresInSchema = z
    .string()
    .transform((value, ctx) => {
        const ms = expiresInToMs(value);
        if (ms === null) {
            ctx.addIssue({ code: 'custom', message: 'expires_in must be a positive integer followed by s, m, h or d, for example 1h' });
            return z.NEVER;
        }

        return ms;
    })
    .refine((ms) => ms >= MIN_EXPIRES_IN_MS, { message: 'expires_in cannot be shorter than 60s' })
    .refine((ms) => ms <= MAX_EXPIRES_IN_MS, { message: 'expires_in cannot exceed 15d' });

const bodySchema = z.strictObject({
    tenant: z.strictObject({
        connections: agentSessionTenantConnectionsSchema
    }),
    toolset: agentSessionToolsetSchema.optional(),
    pinned_tools: agentSessionPinnedToolsSchema.optional(),
    meta_tools: agentSessionMetaToolsSchema.optional(),
    expires_in: agentSessionExpiresInSchema.optional()
});

export const postAgentSessions = asyncWrapperWithEnvironment<PostAgentSessions>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const body = bodySchema.safeParse(req.body);
    if (!body.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(body.error) } });
        return;
    }

    const unknownMetaTools = body.data.meta_tools?.unknown ?? [];
    if (unknownMetaTools.length > 0) {
        res.status(400).send({
            error: {
                code: 'unknown_meta_tool',
                message: `${unknownMetaTools.length} ${unknownMetaTools.length === 1 ? 'key is' : 'keys are'} not a meta tool Nango ships. Supported meta tools are ${META_TOOL_NAMES.join(', ')}.`,
                payload: { meta_tools: unknownMetaTools }
            }
        });
        return;
    }

    const { account, environment, plan } = res.locals;
    const created = await agentSessionService.createAgentSession({
        account,
        environment,
        plan,
        connections: body.data.tenant.connections,
        toolset: body.data.toolset,
        pinnedTools: body.data.pinned_tools,
        metaTools: body.data.meta_tools?.metaTools,
        expiresInMs: body.data.expires_in
    });

    if (created.isErr()) {
        if (created.error.code === 'server_error') {
            res.status(500).send({ error: { code: 'server_error', message: created.error.message } });
            return;
        }

        res.status(400).send({
            error: {
                code: created.error.code,
                message: created.error.message,
                payload: created.error.payload as unknown as AgentSessionCreationErrorPayload
            }
        });
        return;
    }

    trackAgentSessionCreated(created.value.session);

    res.status(201).send({ data: createdAgentSessionToPublicApi(created.value) });
});

export function expiresInToMs(expiresIn: string): number | null {
    const match = EXPIRES_IN_PATTERN.exec(expiresIn);
    if (!match) {
        return null;
    }

    const [, amount, unit] = match;
    const unitInMs = unit ? EXPIRES_IN_UNITS_IN_MS[unit] : undefined;

    return unitInMs ? Number(amount) * unitInMs : null;
}
