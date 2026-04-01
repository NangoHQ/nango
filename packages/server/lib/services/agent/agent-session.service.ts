import { randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

import { getKVStore } from '@nangohq/kvstore';
import { getLogger } from '@nangohq/utils';

import { AGENT_MODEL, createAgentPrompt, createAnswerPrompt, createSessionTitle, resolvePayload } from './agent-runtime.js';
import { agentSandboxTimeoutMs, createAgentSandbox, refreshAgentSandboxTimeout, shouldRefreshAgentSandboxTimeout } from '../e2b/agent-sandbox.service.js';
import { createLocalAgentSandbox } from '../local/agent-sandbox.service.js';

import type { AgentRuntimeHandle, AgentSessionPayload, AgentSessionResolvedPayload } from './agent-runtime.js';
import type { GlobalEvent, Message, PermissionRequest, QuestionRequest } from '@opencode-ai/sdk/v2';

const logger = getLogger('agent-session-service');

const sessionTtlMs = 30 * 60 * 1000; // 30 min per spec
const idleSessionCleanupDelayMs = 5 * 60 * 1000;
const errorSessionCleanupDelayMs = 15_000;

function sessionKey(token: string): string {
    return `agent:session:${token}`;
}

function generateSessionToken(): string {
    return `agt_${randomBytes(32).toString('hex')}`;
}

interface AgentBrowserEvent {
    id: number;
    event: string;
    data: Record<string, unknown>;
}

interface AgentSessionRecord {
    sid: string;
    token: string;
    environmentId: number;
    sandbox: AgentRuntimeHandle | null;
    opencodeSessionId: string | null;
    emitter: EventEmitter;
    backlog: AgentBrowserEvent[];
    nextEventId: number;
    pendingPermissions: Map<string, PermissionRequest>;
    pendingQuestionRequests: Map<string, QuestionRequest>;
    messageRoles: Map<string, Message['role']>;
    messageTexts: Map<string, string>;
    pendingQuestion: { id: string; message: string } | null;
    cleanupTimer: NodeJS.Timeout | null;
    lastSandboxRefreshAt: number;
}

// In-memory store keyed by internal sid
const sessions = new Map<string, AgentSessionRecord>();

function createSandbox(sessionId: string, payload: AgentSessionPayload, onProgress: (message: string) => void): Promise<AgentRuntimeHandle> {
    if (process.env['AGENT_RUNTIME'] === 'local') {
        return createLocalAgentSandbox(sessionId, payload, onProgress);
    }
    return createAgentSandbox(sessionId, payload, onProgress);
}

export interface CreateSessionResult {
    token: string;
    executionTimeoutAt: Date;
}

export async function createAgentSession(environmentId: number, payload: AgentSessionPayload): Promise<CreateSessionResult> {
    const token = generateSessionToken();
    const sid = randomUUID();

    // Store token → {sid, environmentId} in Redis with TTL
    const kv = await getKVStore();
    await kv.set(sessionKey(token), JSON.stringify({ sid, environmentId }), { ttlMs: sessionTtlMs });

    const record: AgentSessionRecord = {
        sid,
        token,
        environmentId,
        sandbox: null,
        opencodeSessionId: null,
        emitter: new EventEmitter(),
        backlog: [],
        nextEventId: 1,
        pendingPermissions: new Map(),
        pendingQuestionRequests: new Map(),
        messageRoles: new Map(),
        messageTexts: new Map(),
        pendingQuestion: null,
        cleanupTimer: null,
        lastSandboxRefreshAt: 0
    };

    sessions.set(sid, record);
    void setupSession(record, resolvePayload(payload));

    return {
        token,
        executionTimeoutAt: new Date(Date.now() + agentSandboxTimeoutMs)
    };
}

/**
 * Validate a session token and return the session record.
 * Returns null if the token is not found, expired, or the environment doesn't match.
 */
export async function getSessionByToken(token: string, environmentId: number): Promise<AgentSessionRecord | null> {
    const kv = await getKVStore();
    const raw = await kv.get(sessionKey(token));
    if (!raw) {
        return null;
    }

    let entry: { sid: string; environmentId: number };
    try {
        entry = JSON.parse(raw) as { sid: string; environmentId: number };
    } catch {
        return null;
    }

    if (entry.environmentId !== environmentId) {
        return null;
    }

    const record = sessions.get(entry.sid) || null;

    // Refresh TTL on activity
    if (record) {
        await kv.set(sessionKey(token), raw, { ttlMs: sessionTtlMs });
    }

    return record;
}

export function subscribeToSession(
    record: AgentSessionRecord,
    listener: (event: AgentBrowserEvent) => void
): { backlog: AgentBrowserEvent[]; unsubscribe: () => void } {
    record.emitter.on('event', listener);
    return {
        backlog: [...record.backlog],
        unsubscribe: () => record.emitter.off('event', listener)
    };
}

export async function answerSession(
    record: AgentSessionRecord,
    answer: { question_id: string; response: string }
): Promise<{ ok: true; kind: 'message' | 'permission' }> {
    if (!record.sandbox || !record.opencodeSessionId) {
        throw new Error('Agent session is still initializing');
    }

    const { question_id, response } = answer;

    // Permission decision
    const permissionId = resolvePermissionId(record, question_id);
    if (permissionId) {
        const reply = response as 'once' | 'always' | 'reject';
        await record.sandbox.client.permission.reply({ requestID: permissionId, reply });
        record.pendingPermissions.delete(permissionId);
        emit(record, 'agent.permission.submitted', { sid: record.sid, permissionId, response });
        return { ok: true, kind: 'permission' };
    }

    // Question answer (v2: client.question.reply / reject)
    const questionReq = record.pendingQuestionRequests.get(question_id);
    if (questionReq) {
        record.pendingQuestionRequests.delete(question_id);
        record.pendingQuestion = null;
        clearCleanup(record);
        touchSandbox(record, true);

        if (response === 'reject') {
            await record.sandbox.client.question.reject({ requestID: question_id });
        } else {
            if (!response.trim()) {
                throw new Error('Response cannot be empty');
            }
            // answers is Array<QuestionAnswer>, one per QuestionInfo in the request
            const answers = questionReq.questions.map(() => [response.trim()]);
            await record.sandbox.client.question.reply({ requestID: question_id, answers });
        }
        emit(record, 'agent.answer.accepted', { sid: record.sid });
        return { ok: true, kind: 'message' };
    }

    // Fallback: free-form message to session (no pending question or permission matched)
    if (!response.trim()) {
        throw new Error('Response cannot be empty');
    }

    record.pendingQuestion = null;
    clearCleanup(record);
    touchSandbox(record, true);

    await record.sandbox.client.session.promptAsync({
        sessionID: record.opencodeSessionId,
        model: { providerID: AGENT_MODEL.providerID, modelID: AGENT_MODEL.modelID },
        parts: [{ type: 'text', text: createAnswerPrompt(response.trim()) }]
    });
    emit(record, 'agent.answer.accepted', { sid: record.sid });
    return { ok: true, kind: 'message' };
}

// -------
// Internal session lifecycle
// -------

async function setupSession(record: AgentSessionRecord, payload: AgentSessionResolvedPayload): Promise<void> {
    const { sid } = record;

    try {
        emitLifecycle(record, 'workspace.creating', 'Spinning up workspace...');

        const sandbox = await createSandbox(sid, payload, (message) => {
            emitLifecycle(record, 'workspace.progress', message);
        });

        record.sandbox = sandbox;
        record.lastSandboxRefreshAt = Date.now();

        emitLifecycle(record, 'workspace.ready', 'Workspace ready');
        emitLifecycle(record, 'agent.starting', 'Starting agent...');

        const created = await sandbox.client.session.create({ title: createSessionTitle(sandbox.resolvedPayload) });
        const session = created.data;
        if (!session) {
            throw new Error('OpenCode did not return a session');
        }

        record.opencodeSessionId = session.id;

        await startEventPump(record);

        emit(record, 'agent.session.started', {
            sid,
            sandboxId: sandbox.sandboxId,
            sessionId: session.id,
            previewUrl: sandbox.baseUrl
        });

        emitLifecycle(record, 'agent.ready', 'Agent ready, sending task...');

        await sandbox.client.session.promptAsync({
            sessionID: session.id,
            model: { providerID: AGENT_MODEL.providerID, modelID: AGENT_MODEL.modelID },
            parts: [{ type: 'text', text: createAgentPrompt(sandbox.resolvedPayload) }]
        });

        emit(record, 'agent.prompt.accepted', { sid, sessionId: session.id });
    } catch (err) {
        logger.error('Failed to set up agent session', { sid, error: err });
        if (record.sandbox) {
            await record.sandbox.destroy();
        }
        emit(record, 'agent.error', {
            sid,
            message: err instanceof Error ? err.message : String(err)
        });
        sessions.delete(sid);
    }
}

async function startEventPump(record: AgentSessionRecord): Promise<void> {
    if (!record.sandbox) {
        return;
    }
    const subscription = await record.sandbox.client.global.event();
    void (async () => {
        try {
            for await (const event of subscription.stream) {
                handleOpenCodeEvent(record, event);
            }
        } catch (err) {
            logger.error('OpenCode event stream failed', { sid: record.sid, error: err });
            emit(record, 'agent.error', {
                sid: record.sid,
                message: err instanceof Error ? err.message : String(err)
            });
        }
    })();
}

function handleOpenCodeEvent(record: AgentSessionRecord, globalEvent: GlobalEvent): void {
    const event = globalEvent.payload;
    const sessionId = record.opencodeSessionId;
    if (!sessionId) {
        return;
    }

    touchSandbox(record);

    switch (event.type) {
        case 'message.part.delta': {
            const { sessionID, messageID, field, delta } = event.properties;
            if (sessionID !== sessionId || field !== 'text') {
                return;
            }
            const role = record.messageRoles.get(messageID);
            if (role && role !== 'assistant') {
                return;
            }
            emit(record, 'agent.delta', { sid: record.sid, sessionId, messageId: messageID, delta });
            return;
        }
        case 'message.part.updated': {
            const part = event.properties.part;
            if (part.sessionID !== sessionId || part.type !== 'tool') {
                return;
            }
            emit(record, 'agent.tool.updated', {
                sid: record.sid,
                sessionId,
                messageId: part.messageID,
                tool: part.tool,
                state: part.state
            });
            return;
        }
        case 'message.updated': {
            const info = event.properties.info;
            if (info.sessionID !== sessionId) {
                return;
            }
            record.messageRoles.set(info.id, info.role);
            emit(record, 'agent.message.updated', { sid: record.sid, sessionId, message: info });
            return;
        }
        case 'question.asked': {
            const req = event.properties;
            if (req.sessionID !== sessionId) {
                return;
            }
            record.pendingQuestionRequests.set(req.id, req);
            const firstQuestion = req.questions[0];
            if (firstQuestion) {
                record.pendingQuestion = { id: req.id, message: firstQuestion.question };
                const options = firstQuestion.options?.map((o) => o.label) ?? [];
                emit(record, 'agent.question', {
                    sid: record.sid,
                    sessionId,
                    questionId: req.id,
                    message: firstQuestion.question,
                    ...(options.length > 0 ? { options } : {})
                });
                clearCleanup(record);
            }
            return;
        }
        case 'permission.asked': {
            const permission = event.properties;
            if (permission.sessionID !== sessionId) {
                return;
            }
            record.pendingPermissions.set(permission.id, permission);
            emit(record, 'agent.permission.requested', { sid: record.sid, sessionId, permission });
            return;
        }
        case 'permission.replied': {
            if (event.properties.sessionID !== sessionId) {
                return;
            }
            record.pendingPermissions.delete(event.properties.requestID);
            emit(record, 'agent.permission.replied', {
                sid: record.sid,
                sessionId,
                permissionId: event.properties.requestID,
                response: event.properties.reply
            });
            return;
        }
        case 'session.status': {
            if (event.properties.sessionID !== sessionId) {
                return;
            }
            emit(record, 'agent.session.status', { sid: record.sid, sessionId, status: event.properties.status });
            return;
        }
        case 'session.idle': {
            if (event.properties.sessionID !== sessionId) {
                return;
            }

            // If there's already a pending question (from the `question` tool), don't schedule cleanup
            if (record.pendingQuestion) {
                return;
            }

            emit(record, 'agent.session.idle', { sid: record.sid, sessionId });
            scheduleCleanup(record, 'idle');
            return;
        }
        case 'session.error': {
            if (event.properties.sessionID && event.properties.sessionID !== sessionId) {
                return;
            }
            emit(record, 'agent.error', { sid: record.sid, sessionId, error: event.properties.error });
            scheduleCleanup(record, 'error');
            return;
        }
        default:
            return;
    }
}

function emitLifecycle(record: AgentSessionRecord, stage: string, message: string): void {
    emit(record, 'agent.lifecycle', { sid: record.sid, stage, message });
}

function emit(record: AgentSessionRecord, event: string, data: Record<string, unknown>): void {
    const payload: AgentBrowserEvent = { id: record.nextEventId, event, data };
    record.nextEventId += 1;
    record.backlog.push(payload);
    if (record.backlog.length > 200) {
        record.backlog.shift();
    }
    record.emitter.emit('event', payload);
}

function clearCleanup(record: AgentSessionRecord): void {
    if (record.cleanupTimer) {
        clearTimeout(record.cleanupTimer);
        record.cleanupTimer = null;
    }
}

function scheduleCleanup(record: AgentSessionRecord, reason: 'idle' | 'error'): void {
    if (record.pendingQuestion || record.pendingPermissions.size > 0 || record.cleanupTimer) {
        return;
    }

    touchSandbox(record, true);

    record.cleanupTimer = setTimeout(
        () => {
            void cleanupSession(record.sid, reason);
        },
        reason === 'idle' ? idleSessionCleanupDelayMs : errorSessionCleanupDelayMs
    );
}

async function cleanupSession(sid: string, reason: 'idle' | 'error'): Promise<void> {
    const record = sessions.get(sid);
    if (!record) {
        return;
    }

    clearCleanup(record);
    sessions.delete(sid);

    if (record.sandbox) {
        await record.sandbox.destroy();
        logger.info('Cleaned up agent sandbox', { sid, sandboxId: record.sandbox.sandboxId, reason });
    }
}

function touchSandbox(record: AgentSessionRecord, force: boolean = false): void {
    if (!record.sandbox) {
        return;
    }
    const now = Date.now();
    if (!force && !shouldRefreshAgentSandboxTimeout(record.lastSandboxRefreshAt, now)) {
        return;
    }
    record.lastSandboxRefreshAt = now;
    void refreshAgentSandboxTimeout(record.sandbox, agentSandboxTimeoutMs);
}

function resolvePermissionId(record: AgentSessionRecord, questionId: string): string | null {
    if (record.pendingPermissions.has(questionId)) {
        return questionId;
    }
    if (record.pendingPermissions.size === 1 && !record.pendingQuestionRequests.has(questionId)) {
        return [...record.pendingPermissions.keys()][0] as string;
    }
    return null;
}
