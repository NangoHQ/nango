import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

import { getLogger } from '@nangohq/utils';

import { createAgentPrompt, createAgentSandbox, createAnswerPrompt, createSessionTitle, destroyAgentSandbox } from '../e2b/agent-sandbox.service.js';

import type { AgentSandboxHandle } from '../e2b/agent-sandbox.service.js';
import type { Event as OpenCodeEvent, Message, Permission } from '@opencode-ai/sdk';

const logger = getLogger('agent-session-service');
const idleSessionCleanupDelayMs = 5 * 60 * 1000;
const errorSessionCleanupDelayMs = 15_000;

type AgentBrowserEvent = {
    id: number;
    event: string;
    data: Record<string, unknown>;
};

interface AgentSessionRecord {
    sid: string;
    sandbox: AgentSandboxHandle;
    opencodeSessionId: string;
    model: {
        providerID: string;
        modelID: string;
        full: string;
    };
    emitter: EventEmitter;
    backlog: AgentBrowserEvent[];
    nextEventId: number;
    pendingPermissions: Map<string, Permission>;
    messageRoles: Map<string, Message['role']>;
    messageTexts: Map<string, string>;
    pendingQuestion: {
        id: string;
        message: string;
    } | null;
    cleanupTimer: NodeJS.Timeout | null;
}

class AgentSessionService {
    private readonly sessions = new Map<string, AgentSessionRecord>();

    public async createBuild(payload: Record<string, unknown>): Promise<{ sid: string; sandboxId: string; sessionId: string; eventsPath: string }> {
        const sid = randomUUID();
        const sandbox = await createAgentSandbox(sid, payload);

        try {
            const created = await sandbox.client.session.create({ body: { title: createSessionTitle(payload) } });
            const session = created.data;
            if (!session) {
                throw new Error('OpenCode did not return a session');
            }
            const record: AgentSessionRecord = {
                sid,
                sandbox,
                opencodeSessionId: session.id,
                model: sandbox.model,
                emitter: new EventEmitter(),
                backlog: [],
                nextEventId: 1,
                pendingPermissions: new Map(),
                messageRoles: new Map(),
                messageTexts: new Map(),
                pendingQuestion: null,
                cleanupTimer: null
            };

            this.sessions.set(sid, record);
            await this.startEventPump(record);

            this.emit(record, 'agent.session.started', {
                sid,
                sandboxId: sandbox.sandboxId,
                sessionId: session.id,
                previewUrl: sandbox.baseUrl
            });

            await sandbox.client.session.promptAsync({
                path: { id: session.id },
                body: {
                    model: {
                        providerID: record.model.providerID,
                        modelID: record.model.modelID
                    },
                    parts: [{ type: 'text', text: createAgentPrompt(payload) }]
                }
            });

            this.emit(record, 'agent.prompt.accepted', { sid, sessionId: session.id });

            return {
                sid,
                sandboxId: sandbox.sandboxId,
                sessionId: session.id,
                eventsPath: `/api/v1/agent/session/${sid}/events`
            };
        } catch (error) {
            await destroyAgentSandbox(sandbox);
            throw error;
        }
    }

    public getSession(sid: string): AgentSessionRecord | null {
        return this.sessions.get(sid) || null;
    }

    public subscribe(sid: string, listener: (event: AgentBrowserEvent) => void): { backlog: AgentBrowserEvent[]; unsubscribe: () => void } {
        const record = this.sessions.get(sid);
        if (!record) {
            throw new Error('Agent session not found');
        }

        record.emitter.on('event', listener);
        return {
            backlog: [...record.backlog],
            unsubscribe: () => record.emitter.off('event', listener)
        };
    }

    public async answer(sid: string, body: Record<string, unknown>): Promise<{ ok: true; kind: 'message' | 'permission' }> {
        const record = this.sessions.get(sid);
        if (!record) {
            throw new Error('Agent session not found');
        }

        const decision = typeof body['decision'] === 'string' ? body['decision'] : typeof body['response'] === 'string' ? body['response'] : null;
        const text = typeof body['text'] === 'string' ? body['text'] : typeof body['answer'] === 'string' ? body['answer'] : null;
        const inferredDecision = record.pendingQuestion ? null : inferPermissionDecision(text);
        const effectiveDecision = decision === 'once' || decision === 'always' || decision === 'reject' ? decision : inferredDecision;

        if (effectiveDecision) {
            const permissionId = this.resolvePermissionId(record, body);
            await record.sandbox.client.postSessionIdPermissionsPermissionId({
                path: { id: record.opencodeSessionId, permissionID: permissionId },
                body: { response: effectiveDecision }
            });
            record.pendingPermissions.delete(permissionId);
            this.emit(record, 'agent.permission.submitted', { sid, permissionId, response: effectiveDecision });
            return { ok: true, kind: 'permission' };
        }

        if (!text || text.trim().length === 0) {
            throw new Error('Expected either a permission decision or a non-empty text answer');
        }

        record.pendingQuestion = null;
        this.clearCleanup(record);

        await record.sandbox.client.session.promptAsync({
            path: { id: record.opencodeSessionId },
            body: {
                model: {
                    providerID: record.model.providerID,
                    modelID: record.model.modelID
                },
                parts: [{ type: 'text', text: createAnswerPrompt(text.trim()) }]
            }
        });
        this.emit(record, 'agent.answer.accepted', { sid });
        return { ok: true, kind: 'message' };
    }

    private resolvePermissionId(record: AgentSessionRecord, body: Record<string, unknown>): string {
        const explicit = typeof body['permissionId'] === 'string' ? body['permissionId'] : null;
        if (explicit && record.pendingPermissions.has(explicit)) {
            return explicit;
        }

        if (record.pendingPermissions.size === 1) {
            return [...record.pendingPermissions.keys()][0] as string;
        }

        throw new Error('Permission decision requires a valid permissionId');
    }

    private async startEventPump(record: AgentSessionRecord): Promise<void> {
        const subscription = await record.sandbox.client.event.subscribe();
        void (async () => {
            try {
                for await (const event of subscription.stream) {
                    this.handleOpenCodeEvent(record, event as OpenCodeEvent);
                }
            } catch (error) {
                logger.error('OpenCode event stream failed', { sid: record.sid, error });
                this.emit(record, 'agent.error', {
                    sid: record.sid,
                    message: error instanceof Error ? error.message : String(error)
                });
            }
        })();
    }

    private handleOpenCodeEvent(record: AgentSessionRecord, event: OpenCodeEvent): void {
        switch (event.type) {
            case 'message.part.updated': {
                const part = event.properties.part;
                if (part.sessionID !== record.opencodeSessionId) {
                    return;
                }

                if (part.type === 'text') {
                    const role = record.messageRoles.get(part.messageID);
                    if (role && role !== 'assistant') {
                        return;
                    }

                    const text = typeof part.text === 'string' ? part.text : (event.properties.delta ?? '');
                    record.messageTexts.set(part.messageID, text);

                    this.emit(record, 'agent.delta', {
                        sid: record.sid,
                        sessionId: record.opencodeSessionId,
                        messageId: part.messageID,
                        delta: event.properties.delta ?? part.text
                    });
                    return;
                }

                if (part.type === 'tool') {
                    if (part.tool === 'question') {
                        const question = extractQuestionFromToolState(part.state);

                        if (question && part.state.status !== 'completed' && part.state.status !== 'error') {
                            if (!record.pendingQuestion || record.pendingQuestion.message !== question) {
                                record.pendingQuestion = {
                                    id: part.callID || part.id,
                                    message: question
                                };
                                this.emit(record, 'agent.question', {
                                    sid: record.sid,
                                    sessionId: record.opencodeSessionId,
                                    questionId: record.pendingQuestion.id,
                                    message: question
                                });
                            }
                            this.clearCleanup(record);
                        }
                    }

                    this.emit(record, 'agent.tool.updated', {
                        sid: record.sid,
                        sessionId: record.opencodeSessionId,
                        messageId: part.messageID,
                        tool: part.tool,
                        state: part.state
                    });
                }
                return;
            }
            case 'message.updated': {
                const info = event.properties.info as Message;
                if (info.sessionID !== record.opencodeSessionId) {
                    return;
                }

                record.messageRoles.set(info.id, info.role);

                this.emit(record, 'agent.message.updated', {
                    sid: record.sid,
                    sessionId: record.opencodeSessionId,
                    message: info
                });
                return;
            }
            case 'permission.updated': {
                const permission = event.properties;
                if (permission.sessionID !== record.opencodeSessionId) {
                    return;
                }
                record.pendingPermissions.set(permission.id, permission);
                this.emit(record, 'agent.permission.requested', {
                    sid: record.sid,
                    sessionId: record.opencodeSessionId,
                    permission
                });
                return;
            }
            case 'permission.replied': {
                if (event.properties.sessionID !== record.opencodeSessionId) {
                    return;
                }
                record.pendingPermissions.delete(event.properties.permissionID);
                this.emit(record, 'agent.permission.replied', {
                    sid: record.sid,
                    sessionId: record.opencodeSessionId,
                    permissionId: event.properties.permissionID,
                    response: event.properties.response
                });
                return;
            }
            case 'session.status': {
                if (event.properties.sessionID !== record.opencodeSessionId) {
                    return;
                }
                this.emit(record, 'agent.session.status', {
                    sid: record.sid,
                    sessionId: record.opencodeSessionId,
                    status: event.properties.status
                });
                return;
            }
            case 'session.idle': {
                if (event.properties.sessionID !== record.opencodeSessionId) {
                    return;
                }

                if (record.pendingQuestion) {
                    return;
                }

                const question = extractPendingQuestion(record);
                if (question) {
                    record.pendingQuestion = {
                        id: randomUUID(),
                        message: question
                    };
                    this.emit(record, 'agent.question', {
                        sid: record.sid,
                        sessionId: record.opencodeSessionId,
                        questionId: record.pendingQuestion.id,
                        message: question
                    });
                    this.clearCleanup(record);
                    return;
                }

                this.emit(record, 'agent.session.idle', {
                    sid: record.sid,
                    sessionId: record.opencodeSessionId
                });
                this.scheduleCleanup(record, 'idle');
                return;
            }
            case 'session.error': {
                if (event.properties.sessionID && event.properties.sessionID !== record.opencodeSessionId) {
                    return;
                }
                this.emit(record, 'agent.error', {
                    sid: record.sid,
                    sessionId: record.opencodeSessionId,
                    error: event.properties.error
                });
                this.scheduleCleanup(record, 'error');
                return;
            }
            default:
                return;
        }
    }

    private emit(record: AgentSessionRecord, event: string, data: Record<string, unknown>): void {
        const payload: AgentBrowserEvent = {
            id: record.nextEventId,
            event,
            data
        };
        record.nextEventId += 1;
        record.backlog.push(payload);
        if (record.backlog.length > 200) {
            record.backlog.shift();
        }
        record.emitter.emit('event', payload);
    }

    private clearCleanup(record: AgentSessionRecord): void {
        if (record.cleanupTimer) {
            clearTimeout(record.cleanupTimer);
            record.cleanupTimer = null;
        }
    }

    private scheduleCleanup(record: AgentSessionRecord, reason: 'idle' | 'error'): void {
        if (record.pendingQuestion || record.pendingPermissions.size > 0 || record.cleanupTimer) {
            return;
        }

        record.cleanupTimer = setTimeout(
            () => {
                void this.cleanupSession(record.sid, reason);
            },
            reason === 'idle' ? idleSessionCleanupDelayMs : errorSessionCleanupDelayMs
        );
    }

    private async cleanupSession(sid: string, reason: 'idle' | 'error'): Promise<void> {
        const record = this.sessions.get(sid);
        if (!record) {
            return;
        }

        this.clearCleanup(record);
        this.sessions.delete(sid);

        await destroyAgentSandbox(record.sandbox);
        logger.info('Cleaned up agent sandbox', {
            sid,
            sandboxId: record.sandbox.sandboxId,
            reason
        });
    }
}

export const agentSessionService = new AgentSessionService();

function extractPendingQuestion(record: AgentSessionRecord): string | null {
    for (const [messageId, role] of [...record.messageRoles.entries()].reverse()) {
        if (role !== 'assistant') {
            continue;
        }

        const text = record.messageTexts.get(messageId)?.trim();
        if (!text) {
            continue;
        }

        const explicit = text.match(/(?:^|\n)QUESTION:\s*(.+)$/im);
        if (explicit?.[1]) {
            return explicit[1].trim();
        }

        if (looksLikeQuestion(text)) {
            return text;
        }

        break;
    }

    return null;
}

function looksLikeQuestion(text: string): boolean {
    const normalized = text.trim();
    if (!normalized.endsWith('?')) {
        return false;
    }

    const lower = normalized.toLowerCase();
    return ['please provide', 'which ', 'what ', 'could you', 'can you', 'do you want', 'should i use', 'i need', 'which connection', 'which integration'].some(
        (phrase) => lower.includes(phrase)
    );
}

function extractQuestionFromToolState(state: unknown): string | null {
    if (!state || typeof state !== 'object') {
        return null;
    }

    const candidates: unknown[] = [];
    const record = state as Record<string, unknown>;

    if (typeof record['title'] === 'string') {
        candidates.push(record['title']);
    }
    if (typeof record['raw'] === 'string') {
        candidates.push(record['raw']);
        try {
            candidates.push(JSON.parse(record['raw']));
        } catch {
            // ignore parse errors
        }
    }
    if (record['input']) {
        candidates.push(record['input']);
    }
    if (typeof record['output'] === 'string') {
        candidates.push(record['output']);
    }

    for (const candidate of candidates) {
        const question = extractQuestionText(candidate);
        if (question) {
            return question;
        }
    }

    return null;
}

function extractQuestionText(value: unknown): string | null {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }

        const explicit = trimmed.match(/(?:^|\n)QUESTION:\s*(.+)$/im);
        if (explicit?.[1]) {
            return explicit[1].trim();
        }

        if (looksLikeQuestion(trimmed)) {
            return trimmed;
        }

        return null;
    }

    if (!value || typeof value !== 'object') {
        return null;
    }

    const record = value as Record<string, unknown>;
    for (const key of ['question', 'message', 'prompt', 'text', 'body', 'description']) {
        const nested = record[key];
        const extracted = extractQuestionText(nested);
        if (extracted) {
            return extracted;
        }
    }

    return null;
}

function inferPermissionDecision(text: string | null): 'once' | 'always' | 'reject' | null {
    if (!text) {
        return null;
    }

    const normalized = text.trim().toLowerCase();
    if (normalized === 'once' || normalized === 'allow once') {
        return 'once';
    }
    if (normalized === 'always' || normalized === 'allow always') {
        return 'always';
    }
    if (normalized === 'reject' || normalized === 'deny' || normalized === 'no') {
        return 'reject';
    }

    return null;
}
