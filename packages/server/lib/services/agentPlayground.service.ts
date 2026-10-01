import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { convertToModelMessages, dynamicTool, jsonSchema, stepCountIs, streamText, toUIMessageStream } from 'ai';

import db from '@nangohq/database';
import { configService, connectionService, getProvider, sharedCredentialsService } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { createAgentSessionMcpServer, TOOL_NAME_SEPARATOR } from '../controllers/agent/mcp/sessionServer.js';
import { envs } from '../env.js';
import { getOrchestrator } from '../utils/utils.js';
import { createPlaygroundModel } from './agentPlaygroundModel.service.js';
import * as agentSessionService from './agentSession.service.js';
import * as agentSessionCreationService from './agentSessionCreation.service.js';

import type { ModelCallStats } from './agentPlaygroundModel.service.js';
import type {
    AgentPlaygroundMessageMetadata,
    AgentSession,
    AgentSessionPinnedConnection,
    DBEnvironment,
    DBPlan,
    DBTeam,
    DBUser,
    IntegrationConfig,
    Provider
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { JSONSchema7, LanguageModel, ToolSet, UIMessage, UIMessageChunk } from 'ai';

const logger = getLogger('AgentPlayground');

const SESSION_EXPIRES_IN_MS = 60 * 60 * 1000;
const MAX_STEPS = 10;

export const PLAYGROUND_INTEGRATION_PREFIX = 'pg-';
export const PLAYGROUND_PROVIDERS: { provider: string; sharedCredentialsName?: string }[] = [
    { provider: 'google-calendar' },
    { provider: 'github', sharedCredentialsName: 'github-getting-started' }
];
export const PLAYGROUND_USER_TAG_KEY = 'nango/playground_user';

const INSTRUCTIONS = `You are the Nango Agent Playground assistant. You act on the user's connected apps through the Nango tools you are given.
Use nango_tool_search to find a tool for what the user asks, then call it through nango_execute.
Search with a few keywords, such as "list calendar events", not a full sentence.
Before searching again, always say in one short sentence what the last search found and what you will look for instead. When one of the related tools fits, search for it by its exact tool name. If you already have a tool's input schema from earlier in this conversation, reuse it instead of searching again.
If no tool fits but the app is connected, call its API directly with nango_proxy.
The user is asked to approve any change: a tool that is not a read, or a proxy request other than GET. So make the call itself rather than asking for permission first.
You cannot skip this approval. If the user asks you to remove it or not to ask, say a change always needs their approval here, then make the request anyway.
When a request is denied, the user declined it, not the app. Say you did not make the change because they declined it.
Ask tools for no more results than the question needs: a limit of 10 to 25 is enough unless the user asks for everything.
Report what the tools returned plainly and do not invent data. If nothing works or a call fails, say so.
If the right app is not connected, call nango_create_connection for it. The user sees a Connect button for the link, so do not repeat the link. Say in one sentence what they are connecting and wait. When they tell you it is connected, carry on with the original request.
Before calling nango_proxy, say in one short sentence that there is no ready-made tool, so you will do it through the app's API directly. Describe the task, not any check you run first. Do not repeat this if you already said it earlier in this conversation.
Before a write through nango_proxy, GET first to see whether the change is already in place, and if it is, tell the user instead of making it again. For example, GitHub's GET /user/starred/{owner}/{repo} answers 204 when the repository is already starred and 404 when it is not.
Answer in short, friendly markdown. Never put links in a list of results, such as a list of calendar events: every row stays plain text. When you mention a single thing on its own, link its name, such as the repository name, rather than adding a separate labelled link like "(Google Calendar)". Always do this when confirming something you just created or changed, such as a new calendar event, if the result has its URL. Use emojis to make answers easier to read: start a confirmation with ✅ when a change went through, with ❌ when it failed or was declined, and add a fitting emoji where it helps, without overdoing it. Use lists or tables when they make results easier to scan.`;

export type PlaygroundUIMessage = UIMessage<AgentPlaygroundMessageMetadata>;

export interface PlaygroundContext {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
    user: DBUser;
}

export class AgentPlaygroundError extends Error {
    constructor(
        public readonly code: 'session_creation_failed' | 'model_error',
        message: string,
        options?: { cause?: unknown }
    ) {
        super(message, options);
        this.name = 'AgentPlaygroundError';
    }
}

// Rounded to the hour: the instructions are part of the model cache key.
export function buildInstructions(
    timeZone: string,
    now: Date,
    integrations: { id: string; provider: string; connected: boolean }[] = [],
    unavailable: string[] = []
): string {
    const local = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        hourCycle: 'h23'
    }).format(now);

    const listed = integrations.map(({ id, provider, connected }) => `- ${id} (${provider}): ${connected ? 'connected' : 'not connected'}`).join('\n');
    const available = listed ? `\nThe integrations in this session, by the id every tool expects:\n${listed}` : '';
    const missing =
        unavailable.length > 0
            ? `\nThese apps could not be set up in the playground right now: ${unavailable.join(', ')}. If the user asks for one, say it is unavailable in the playground at the moment, instead of searching for it.`
            : '';

    return `${INSTRUCTIONS}\nThe user's time zone is ${timeZone}. It is currently ${local}:00 there.${available}${missing}`;
}

export function pinNewestConnectionPerIntegration(
    rows: { connection: { provider_config_key: string; connection_id: string } }[]
): AgentSessionPinnedConnection[] {
    const pinned = new Map<string, AgentSessionPinnedConnection>();
    for (const { connection } of rows) {
        if (!pinned.has(connection.provider_config_key)) {
            pinned.set(connection.provider_config_key, { integrationId: connection.provider_config_key, connectionId: connection.connection_id });
        }
    }
    return [...pinned.values()];
}

export function playgroundIntegrationId(provider: string): string {
    return `${PLAYGROUND_INTEGRATION_PREFIX}${provider}`;
}

type OAuthApp = (typeof envs.NANGO_AGENT_PLAYGROUND_OAUTH_APPS)[string];

export async function ensurePlaygroundIntegrations(environment: DBEnvironment): Promise<string[]> {
    const ensured = await Promise.all(PLAYGROUND_PROVIDERS.map((entry) => ensurePlaygroundIntegration(environment, entry)));
    return ensured.filter((integrationId): integrationId is string => integrationId !== null);
}

async function ensurePlaygroundIntegration(
    environment: DBEnvironment,
    { provider: providerName, sharedCredentialsName }: (typeof PLAYGROUND_PROVIDERS)[number]
): Promise<string | null> {
    const integrationId = playgroundIntegrationId(providerName);
    const provider = getProvider(providerName);
    if (!provider) {
        logger.error(`Agent Playground provider ${providerName} does not exist`);
        return null;
    }

    const ownApp = envs.NANGO_AGENT_PLAYGROUND_OAUTH_APPS[providerName];
    // Read the primary: on a stale replica read, the create below adds a suffixed duplicate.
    const existing = await configService.getProviderConfig(integrationId, environment.id, db.knex);
    if (existing) {
        if (ownApp && !usesOwnApp(existing, ownApp)) {
            await configService.editProviderConfig(
                {
                    ...existing,
                    shared_credentials_id: null,
                    oauth_client_id: ownApp.clientId,
                    oauth_client_secret: ownApp.clientSecret,
                    oauth_scopes: ownApp.scopes ?? existing.oauth_scopes
                },
                provider
            );
        }
        return integrationId;
    }

    const created = ownApp
        ? await createWithOwnApp({ environment, integrationId, providerName, provider, app: ownApp })
        : await sharedCredentialsService.createPreprovisionedProvider({
              providerName,
              ...(sharedCredentialsName ? { shared_credentials_name: sharedCredentialsName } : {}),
              environment_id: environment.id,
              provider,
              unique_key: integrationId,
              display_name: provider.display_name
          });
    if (created.isErr()) {
        logger.error(`Agent Playground could not create ${integrationId}: ${created.error.message}`);
        return null;
    }

    // A concurrent request created it first, so this one got a suffixed key.
    if (created.value.unique_key !== integrationId && created.value.id) {
        await configService.deleteProviderConfig({
            id: created.value.id,
            environmentId: environment.id,
            providerConfigKey: created.value.unique_key,
            orchestrator: getOrchestrator()
        });
    }
    return integrationId;
}

function usesOwnApp(config: NonNullable<Awaited<ReturnType<typeof configService.getProviderConfig>>>, app: OAuthApp): boolean {
    return (
        !config.shared_credentials_id &&
        config.oauth_client_id === app.clientId &&
        config.oauth_client_secret === app.clientSecret &&
        (app.scopes === undefined || config.oauth_scopes === app.scopes)
    );
}

async function createWithOwnApp({
    environment,
    integrationId,
    providerName,
    provider,
    app
}: {
    environment: DBEnvironment;
    integrationId: string;
    providerName: string;
    provider: Provider;
    app: OAuthApp;
}): Promise<Result<IntegrationConfig>> {
    try {
        const created = await configService.createProviderConfig(
            {
                environment_id: environment.id,
                unique_key: integrationId,
                provider: providerName,
                forward_webhooks: true,
                shared_credentials_id: null,
                display_name: provider.display_name,
                oauth_client_id: app.clientId,
                oauth_client_secret: app.clientSecret,
                oauth_scopes: app.scopes ?? null
            },
            provider
        );
        return created ? Ok(created) : Err(new Error('Integration was not created'));
    } catch (err) {
        return Err(err instanceof Error ? err : new Error(String(err)));
    }
}

// Read live: the session's own connection list only fills in once a tool uses a connection.
async function connectedIntegrations(ctx: PlaygroundContext, integrationIds: string[]): Promise<Set<string>> {
    if (integrationIds.length === 0) {
        return new Set();
    }
    const rows = await connectionService.listConnections({
        environmentId: ctx.environment.id,
        integrationIds,
        tags: { [PLAYGROUND_USER_TAG_KEY]: ctx.user.uuid }
    });
    return new Set(rows.map(({ connection }) => connection.provider_config_key));
}

// The owner is read from the create-connection tags, so those tags must stay per user.
export function sessionOwner(session: Pick<AgentSession, 'metaTools'>): string | undefined {
    return session.metaTools.nangoCreateConnection.tags[PLAYGROUND_USER_TAG_KEY];
}

async function getOrCreateSession(ctx: PlaygroundContext, sessionId: string | undefined): Promise<Result<AgentSession, AgentPlaygroundError>> {
    if (sessionId) {
        const existing = await agentSessionService.getAgentSession(db.knex, { id: sessionId, accountId: ctx.account.id, environmentId: ctx.environment.id });
        if (existing.isOk() && !existing.value.endedAt && existing.value.expiresAt > new Date() && sessionOwner(existing.value) === ctx.user.uuid) {
            return Ok(existing.value);
        }
    }

    const integrationIds = await ensurePlaygroundIntegrations(ctx.environment);
    const userTag = { [PLAYGROUND_USER_TAG_KEY]: ctx.user.uuid };
    const rows = integrationIds.length > 0 ? await connectionService.listConnections({ environmentId: ctx.environment.id, integrationIds, tags: userTag }) : [];

    const created = await agentSessionCreationService.createAgentSession({
        account: ctx.account,
        environment: ctx.environment,
        connections: { any: [], pinned: pinNewestConnectionPerIntegration(rows) },
        // Every playground integration, connected or not, so the agent can offer to connect a missing app.
        toolset: Object.fromEntries(integrationIds.map((integrationId) => [integrationId, { allow: '*', deny: [] }])),
        pinnedTools: undefined,
        metaTools: { nango_create_connection: { enabled: true, tags: userTag }, nango_proxy: { enabled: true } },
        expiresInMs: SESSION_EXPIRES_IN_MS
    });

    if (created.isErr()) {
        return Err(new AgentPlaygroundError('session_creation_failed', created.error.message, { cause: created.error }));
    }
    return Ok(created.value.session);
}

export async function buildMcpTools(client: Client): Promise<ToolSet> {
    const tools: Awaited<ReturnType<Client['listTools']>>['tools'] = [];
    let cursor: string | undefined;
    do {
        const page = await client.listTools(cursor ? { cursor } : undefined);
        tools.push(...page.tools);
        cursor = page.nextCursor;
    } while (cursor);

    return Object.fromEntries(
        tools.map((mcpTool) => {
            const { $schema: _schema, ...inputSchema } = mcpTool.inputSchema;

            return [
                mcpTool.name,
                dynamicTool({
                    description: mcpTool.description ?? '',
                    inputSchema: jsonSchema(inputSchema as JSONSchema7),
                    execute: async (input) => {
                        const result = await client.callTool({ name: mcpTool.name, arguments: input as Record<string, unknown> });
                        const output = result.structuredContent ?? parseTextContent(result.content);
                        if (result.isError) {
                            throw new Error(typeof output === 'string' ? output : JSON.stringify(output));
                        }
                        return output;
                    }
                })
            ];
        })
    );
}

// Actions carry no read-only flag, so anything not named like a read waits for the user.
const READ_ACTION = /^(list|get|search|fetch|find|read)-/;

export function toolNeedsApproval(toolName: string, input: unknown): boolean {
    const args = (input ?? {}) as { method?: unknown; tool?: unknown };
    if (toolName === 'nango_proxy') {
        return typeof args.method !== 'string' || args.method.toUpperCase() !== 'GET';
    }

    const qualified = toolName === 'nango_execute' ? args.tool : toolName;
    if (typeof qualified !== 'string') {
        return toolName === 'nango_execute';
    }
    const separator = qualified.indexOf(TOOL_NAME_SEPARATOR);
    if (separator <= 0) {
        return false;
    }
    return !READ_ACTION.test(qualified.slice(separator + TOOL_NAME_SEPARATOR.length));
}

function parseTextContent(content: { type: string; text?: string }[]): unknown {
    const text = content
        .filter((part) => part.type === 'text')
        .map((part) => part.text ?? '')
        .join('\n');
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

export async function startTurn({
    ctx,
    sessionId,
    messages,
    timeZone,
    abortSignal,
    model
}: {
    ctx: PlaygroundContext;
    sessionId: string | undefined;
    messages: PlaygroundUIMessage[];
    timeZone: string;
    abortSignal?: AbortSignal;
    model?: (stats: ModelCallStats) => LanguageModel;
}): Promise<Result<ReadableStream<UIMessageChunk<AgentPlaygroundMessageMetadata>>, AgentPlaygroundError>> {
    const session = await getOrCreateSession(ctx, sessionId);
    if (session.isErr()) {
        return Err(session.error);
    }

    const server = createAgentSessionMcpServer({ account: ctx.account, environment: ctx.environment, plan: ctx.plan, session: session.value });
    const client = new Client({ name: 'nango-agent-playground', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    let closed = false;
    const close = async () => {
        if (closed) {
            return;
        }
        closed = true;
        await client.close();
        await server.close();
    };

    let tools: ToolSet;
    let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
    let connected: Set<string>;
    try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        [tools, modelMessages, connected] = await Promise.all([
            buildMcpTools(client),
            convertToModelMessages(messages),
            connectedIntegrations(ctx, Object.keys(session.value.compiledToolset))
        ]);
    } catch (err) {
        await close();
        return Err(new AgentPlaygroundError('model_error', err instanceof Error ? err.message : 'The agent could not start', { cause: err }));
    }

    const stats: ModelCallStats = { modelCalls: 0, cachedModelCalls: 0 };

    const result = streamText({
        model: (model ?? createPlaygroundModel)(stats),
        instructions: buildInstructions(
            timeZone,
            new Date(),
            Object.entries(session.value.compiledToolset).map(([id, integration]) => ({ id, provider: integration.provider, connected: connected.has(id) })),
            PLAYGROUND_PROVIDERS.filter(({ provider }) => !Object.hasOwn(session.value.compiledToolset, playgroundIntegrationId(provider))).map(
                ({ provider }) => getProvider(provider)?.display_name ?? provider
            )
        ),
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(MAX_STEPS),
        ...(abortSignal ? { abortSignal } : {}),
        toolApproval: ({ toolCall }) => (toolNeedsApproval(toolCall.toolName, toolCall.input) ? 'user-approval' : undefined),
        onEnd: close,
        onAbort: close,
        onError: async ({ error }) => {
            logger.error(`Agent Playground turn failed: ${error instanceof Error ? error.message : String(error)}`);
            await close();
        }
    });

    return Ok(
        toUIMessageStream({
            stream: result.stream,
            originalMessages: messages,
            onError: (error) => (error instanceof Error ? error.message : 'The agent failed to answer'),
            messageMetadata: ({ part }): AgentPlaygroundMessageMetadata | undefined => {
                if (part.type === 'start') {
                    return { sessionId: session.value.id };
                }
                if (part.type === 'finish') {
                    const usage = {
                        inputTokens: part.totalUsage.inputTokens ?? 0,
                        outputTokens: part.totalUsage.outputTokens ?? 0,
                        modelCalls: stats.modelCalls,
                        cachedModelCalls: stats.cachedModelCalls
                    };
                    logger.info(
                        `Agent Playground turn: ${usage.inputTokens} in / ${usage.outputTokens} out tokens, ${usage.cachedModelCalls}/${usage.modelCalls} model calls from cache`
                    );
                    return { sessionId: session.value.id, usage };
                }
                return undefined;
            }
        })
    );
}
