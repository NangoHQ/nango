import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '@/utils/api';
import { globalEnv } from '@/utils/env';

import type { AgentEventName, PostAgentSessionStart } from '@nangohq/types';

export type AgentEvent =
    | { eventType: 'agent.lifecycle'; type: 'progress'; message: string }
    | { eventType: 'agent.session.started'; type: 'session'; session_id: string }
    | { eventType: 'agent.delta'; type: 'progress'; messageId: string; message: string }
    | {
          eventType: 'agent.tool.updated';
          type: 'debug';
          messageId: string;
          tool: string;
          status: 'pending' | 'running' | 'completed' | 'error';
          input: Record<string, unknown>;
          title?: string;
          duration?: number;
      }
    | {
          eventType: 'agent.message.updated';
          type: 'debug';
          messageId: string;
          tokens: { input: number; output: number; total: number };
          cost: number;
          finish: string;
          duration: number;
      }
    | { eventType: 'agent.question'; type: 'question'; question_id: string; message: string; options?: string[] | undefined }
    | { eventType: 'agent.permission.requested'; type: 'question'; question_id: string; permission: string; patterns: string[] }
    | { eventType: 'agent.session.idle'; type: 'done'; message: string }
    | { eventType: 'agent.error'; type: 'error'; message: string }
    | { eventType: 'user.message'; type: 'user'; message: string };

export type ChatStatus = 'idle' | 'starting' | 'streaming' | 'awaiting_answer' | 'finished' | 'error';

interface PendingQuestion {
    question_id: string;
    message: string;
}

interface UseChatParams {
    env: string;
    integrationId: string;
    connectionId?: string;
}

export interface UseChatReturn {
    status: ChatStatus;
    events: AgentEvent[];
    pendingQuestion: PendingQuestion | null;
    error: string | null;
    startSession: (prompt: string) => Promise<void>;
    sendAnswer: (response: string) => Promise<void>;
    mockQuestion: () => void;
}

function parseEvent(eventType: AgentEventName, data: Record<string, unknown>): AgentEvent | null {
    switch (eventType) {
        case 'agent.lifecycle':
            return { eventType, type: 'progress', message: data['message'] as string };
        case 'agent.session.started':
            return { eventType, type: 'session', session_id: data['sessionId'] as string };
        case 'agent.delta':
            return { eventType, type: 'progress', messageId: data['messageId'] as string, message: data['delta'] as string };
        case 'agent.tool.updated': {
            const tool = data['tool'] as string;
            const state = data['state'] as Record<string, unknown>;
            const status = state['status'] as 'pending' | 'running' | 'completed' | 'error';
            const input = (state['input'] ?? {}) as Record<string, unknown>;
            const title = state['title'] as string | undefined;
            const time = state['time'] as { start?: number; end?: number } | undefined;
            const duration = time?.start && time?.end ? time.end - time.start : undefined;
            return { eventType, type: 'debug', messageId: data['messageId'] as string, tool, status, input, title, duration };
        }
        case 'agent.message.updated': {
            const msg = data['message'] as Record<string, unknown>;
            const time = msg['time'] as { created: number; completed?: number } | undefined;
            if (msg['role'] !== 'assistant' || !time?.completed) {
                return null;
            }
            const tokens = (msg['tokens'] as { input: number; output: number; total: number }) ?? { input: 0, output: 0, total: 0 };
            const cost = (msg['cost'] as number) ?? 0;
            const finish = (msg['finish'] as string) ?? '';
            const duration = time.completed - time.created;
            return { eventType, type: 'debug', messageId: msg['id'] as string, tokens, cost, finish, duration };
        }
        case 'agent.question':
            return {
                eventType,
                type: 'question',
                question_id: data['question_id'] as string,
                message: data['message'] as string,
                options: data['options'] as string[] | undefined
            };
        case 'agent.permission.requested':
            return {
                eventType,
                type: 'question',
                question_id: data['question_id'] as string,
                permission: data['permission'] as string,
                patterns: data['patterns'] as string[]
            };
        case 'agent.session.idle':
            return { eventType, type: 'done', message: data['message'] as string };
        case 'agent.error':
            return { eventType, type: 'error', message: data['error'] instanceof Object ? JSON.stringify(data['error']) : (data['error'] as string) };
    }
}

export function useChat({ env, integrationId, connectionId }: UseChatParams): UseChatReturn {
    const [status, setStatus] = useState<ChatStatus>('idle');
    const [events, setEvents] = useState<AgentEvent[]>([]);
    const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sessionToken, setSessionToken] = useState<string | null>(null);

    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        return () => {
            eventSourceRef.current?.close();
        };
    }, []);

    const openEventSource = useCallback((token: string) => {
        const url = `${globalEnv.apiUrl}/api/v1/agent/session/${token}/events?env=${env}`;
        const es = new EventSource(url, { withCredentials: true });
        eventSourceRef.current = es;

        const makeHandler = (eventType: AgentEventName) => (e: MessageEvent) => {
            const data = JSON.parse(e.data as string) as Record<string, unknown>;
            const event = parseEvent(eventType, data);
            if (event) {
                setEvents((prev) => {
                    if (event.eventType === 'agent.delta') {
                        for (let i = prev.length - 1; i >= 0; i--) {
                            const ev = prev[i];
                            if (ev.eventType === 'agent.delta' && ev.messageId === event.messageId) {
                                const updated = [...prev];
                                updated[i] = { ...ev, message: ev.message + event.message };
                                return updated;
                            }
                        }
                    } else if (event.eventType === 'agent.tool.updated' || event.eventType === 'agent.message.updated') {
                        for (let i = prev.length - 1; i >= 0; i--) {
                            const ev = prev[i];
                            if (ev.eventType === event.eventType && ev.messageId === event.messageId) {
                                const updated = [...prev];
                                updated[i] = event;
                                return updated;
                            }
                        }
                    }
                    return [...prev, event];
                });
            }

            if (eventType === 'agent.question' || eventType === 'agent.permission.requested') {
                const message = eventType === 'agent.question' ? (data['message'] as string) : (data['permission'] as string);
                setPendingQuestion({ question_id: data['question_id'] as string, message });
                setStatus('awaiting_answer');
            } else if (eventType === 'agent.session.idle') {
                setStatus('finished');
                eventSourceRef.current?.close();
                eventSourceRef.current = null;
            } else if (eventType === 'agent.error') {
                setError(data['error'] instanceof Object ? JSON.stringify(data['error']) : (data['error'] as string));
                setStatus('error');
                eventSourceRef.current?.close();
                eventSourceRef.current = null;
            }
        };

        const sseEvents: AgentEventName[] = [
            'agent.lifecycle',
            'agent.session.started',
            'agent.delta',
            'agent.tool.updated',
            'agent.message.updated',
            'agent.question',
            'agent.permission.requested',
            'agent.session.idle',
            'agent.error'
        ];

        for (const eventType of sseEvents) {
            es.addEventListener(eventType, makeHandler(eventType));
        }

        es.onerror = () => {
            setError('Connection lost');
            setStatus('error');
            eventSourceRef.current?.close();
            eventSourceRef.current = null;
        };
    }, []);

    const startSession = useCallback(
        async (prompt: string) => {
            if (status !== 'idle') {
                return;
            }

            setStatus('starting');
            setError(null);
            setEvents([{ eventType: 'user.message', type: 'user', message: prompt }]);

            const body: PostAgentSessionStart['Body'] = { prompt, integration_id: integrationId };
            if (connectionId) {
                body['connection_id'] = connectionId;
            }

            const res = await apiFetch(`/api/v1/agent/session/start?env=${env}`, {
                method: 'POST',
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const json = (await res.json()) as Record<string, unknown>;
                setError((json['message'] as string | undefined) ?? 'Failed to start session');
                setStatus('error');
                return;
            }

            const json = (await res.json()) as PostAgentSessionStart['Success'];
            setSessionToken(json.session_token);
            setStatus('streaming');
            openEventSource(json.session_token);
        },
        [status, env, integrationId, connectionId, openEventSource]
    );

    const sendAnswer = useCallback(
        async (response: string) => {
            if (!pendingQuestion || !sessionToken) {
                return;
            }

            const res = await apiFetch(`/api/v1/agent/session/${sessionToken}/answer?env=${env}`, {
                method: 'POST',
                body: JSON.stringify({ question_id: pendingQuestion.question_id, response })
            });

            if (!res.ok) {
                const json = (await res.json()) as Record<string, unknown>;
                setError((json['message'] as string | undefined) ?? 'Failed to send answer');
                setStatus('error');
                return;
            }

            setEvents((prev) => [...prev, { eventType: 'user.message', type: 'user', message: response }]);
            setPendingQuestion(null);
            setStatus('streaming');
        },
        [pendingQuestion, sessionToken]
    );

    const mockQuestion = useCallback(() => {
        const question_id = `debug-${Date.now()}`;
        const message = 'Debug question: what should happen next?';
        setEvents((prev) => [...prev, { eventType: 'agent.question', type: 'question', question_id, message, options: ['Option A', 'Option B'] }]);
        setPendingQuestion({ question_id, message });
        setStatus('awaiting_answer');
    }, []);

    return { status, events, pendingQuestion, error, startSession, sendAnswer, mockQuestion };
}
