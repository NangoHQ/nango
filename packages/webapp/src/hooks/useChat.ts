import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '@/utils/api';
import { globalEnv } from '@/utils/env';

export type AgentEvent =
    | { eventType: 'agent.lifecycle'; type: 'progress'; message: string }
    | { eventType: 'agent.session.started'; type: 'session'; session_id: string }
    | { eventType: 'agent.delta'; type: 'progress'; message: string }
    | { eventType: 'agent.tool.updated'; type: 'debug'; message: string }
    | { eventType: 'agent.message.updated'; type: 'debug'; message: string }
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
}

function parseEvent(eventType: string, data: Record<string, unknown>): AgentEvent | null {
    switch (eventType) {
        case 'agent.lifecycle':
            return { eventType, type: 'progress', message: data['message'] as string };
        case 'agent.session.started':
            return { eventType, type: 'session', session_id: data['session_id'] as string };
        case 'agent.delta':
            return { eventType, type: 'progress', message: data['message'] as string };
        case 'agent.tool.updated':
            return { eventType, type: 'debug', message: data['message'] as string };
        case 'agent.message.updated':
            return { eventType, type: 'debug', message: data['message'] as string };
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
            return { eventType, type: 'error', message: data['message'] as string };
        default:
            return null;
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
        const url = `${globalEnv.apiUrl}/api/v1/agent/session/${token}/events`;
        const es = new EventSource(url, { withCredentials: true });
        eventSourceRef.current = es;

        const makeHandler = (eventType: string) => (e: MessageEvent) => {
            const data = JSON.parse(e.data as string) as Record<string, unknown>;
            const event = parseEvent(eventType, data);
            if (event) {
                setEvents((prev) => [...prev, event]);
            }

            if (eventType === 'agent.question' || eventType === 'agent.permission.requested') {
                setPendingQuestion({ question_id: data['question_id'] as string, message: data['message'] as string });
                setStatus('awaiting_answer');
            } else if (eventType === 'agent.session.idle') {
                setStatus('finished');
                es.close();
            } else if (eventType === 'agent.error') {
                setError(data['message'] as string);
                setStatus('error');
                es.close();
            }
        };

        const sseEvents = [
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
            es.close();
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

            const body: Record<string, string | undefined> = { prompt, integration_id: integrationId };
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

            const json = (await res.json()) as { session_token: string; execution_timeout_at: string };
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

            const res = await apiFetch(`/api/v1/agent/session/${sessionToken}/answer`, {
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

    return { status, events, pendingQuestion, error, startSession, sendAnswer };
}
