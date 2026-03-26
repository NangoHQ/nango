import { Bot, CheckCircle2, ChevronDown, ChevronUp, Loader, RotateCcw, Send, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';

import { Button } from '../../components-v2/ui/button';
import { Input } from '../../components-v2/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components-v2/ui/select';
import { Textarea } from '../../components-v2/ui/textarea';
import { useConnections } from '../../hooks/useConnections';
import { useEnvironment } from '../../hooks/useEnvironment';
import { useListIntegrations } from '../../hooks/useIntegration';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { cn } from '@/utils/utils';

const AGENT_BASE = '/api/agent';

// ─── Types ────────────────────────────────────────────────────────────────────

type SseEvent =
    | { type: 'session'; session_id: string }
    | { type: 'progress'; message: string }
    | { type: 'question'; question_id: string; message: string }
    | { type: 'code'; language: string; content: string }
    | { type: 'deploy_result'; status: 'success' | 'error'; data: unknown }
    | { type: 'run_result'; status: 'success' | 'error'; data: unknown }
    | { type: 'done'; message: string }
    | { type: 'error'; message: string };

type FeedEntry = SseEvent & { id: number };

// ─── Feed item components ─────────────────────────────────────────────────────

const ProgressLine: React.FC<{ message: string }> = ({ message }) => (
    <div className="flex gap-2 items-start text-body-small-regular text-text-light-gray py-0.5">
        <span className="text-text-tertiary mt-0.5 shrink-0">›</span>
        <span className="whitespace-pre-wrap break-all">{message}</span>
    </div>
);

const CodeBlock: React.FC<{ language: string; content: string }> = ({ content }) => {
    const [collapsed, setCollapsed] = useState(false);
    const lines = content.split('\n');
    const preview = lines.slice(0, 4).join('\n');

    return (
        <div className="my-2 rounded-md border border-border-gray overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-active-bg">
                <span className="text-body-small-regular text-text-tertiary font-code">typescript</span>
                <button
                    onClick={() => setCollapsed((c) => !c)}
                    className="text-text-tertiary hover:text-text-primary transition-colors flex items-center gap-1 text-body-small-regular"
                >
                    {collapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
                    {collapsed ? 'expand' : 'collapse'}
                </button>
            </div>
            <pre className="font-code text-xs text-text-primary p-3 overflow-x-auto bg-transparent leading-relaxed">
                {collapsed ? preview + (lines.length > 4 ? `\n… (${lines.length - 4} more lines)` : '') : content}
            </pre>
        </div>
    );
};

const ResultBadge: React.FC<{ type: 'deploy_result' | 'run_result'; status: 'success' | 'error'; data: unknown }> = ({ type, status, data }) => {
    const [expanded, setExpanded] = useState(false);
    const label = type === 'deploy_result' ? 'Deploy' : 'Dry-run';

    return (
        <div className="my-2">
            <button
                onClick={() => setExpanded((e) => !e)}
                className={cn(
                    'flex items-center gap-2 text-body-small-medium px-3 py-1.5 rounded-md border transition-colors',
                    status === 'success'
                        ? 'border-success-400/30 text-success-400 bg-success-400/10 hover:bg-success-400/20'
                        : 'border-alert-400/30 text-alert-400 bg-alert-400/10 hover:bg-alert-400/20'
                )}
            >
                {status === 'success' ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                {label} {status}
                <ChevronDown className={cn('size-3.5 ml-auto transition-transform', expanded && 'rotate-180')} />
            </button>
            {expanded && (
                <pre className="mt-1 font-code text-xs text-text-light-gray p-3 bg-active-bg rounded-md border border-border-gray overflow-x-auto leading-relaxed">
                    {JSON.stringify(data, null, 2)}
                </pre>
            )}
        </div>
    );
};

const QuestionCard: React.FC<{
    message: string;
    onAnswer: (answer: string) => void;
    disabled: boolean;
}> = ({ message, onAnswer, disabled }) => {
    const [answer, setAnswer] = useState('');

    return (
        <div className="my-3 rounded-md border border-border-gray bg-active-bg p-3 flex flex-col gap-2">
            <div className="flex items-start gap-2">
                <Bot className="size-4 text-text-tertiary shrink-0 mt-0.5" />
                <p className="text-body-small-regular text-text-primary">{message}</p>
            </div>
            <div className="flex gap-2 items-center">
                <Input
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && answer.trim()) {
                            onAnswer(answer.trim());
                        }
                    }}
                    placeholder="Your answer..."
                    disabled={disabled}
                    className="h-8 text-body-small-regular"
                    autoFocus
                />
                <Button size="sm" variant="primary" onClick={() => answer.trim() && onAnswer(answer.trim())} disabled={disabled || !answer.trim()}>
                    <Send className="size-3.5" />
                    Send
                </Button>
            </div>
        </div>
    );
};

const DoneCard: React.FC<{ message: string }> = ({ message }) => (
    <div className="mt-3 rounded-md border border-success-400/30 bg-success-400/10 p-4">
        <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="size-4 text-success-400" />
            <span className="text-body-small-medium text-success-400">Done</span>
        </div>
        <p className="text-body-small-regular text-text-light-gray whitespace-pre-wrap">{message}</p>
    </div>
);

// ─── Main page ────────────────────────────────────────────────────────────────

export const FunctionBuilder: React.FC = () => {
    const env = useStore((state) => state.env);
    const { environmentAndAccount } = useEnvironment(env);
    const secretKey = environmentAndAccount?.environment.secret_key ?? '';

    const { data: integrationsData } = useListIntegrations(env);
    const integrations = integrationsData?.data ?? [];

    const [integrationId, setIntegrationId] = useState('');

    const { data: connectionsData } = useConnections({ env, integrationIds: integrationId ? [integrationId] : undefined });
    const connections = useMemo(() => connectionsData?.pages.flatMap((p) => p.data) ?? [], [connectionsData]);

    // Form state
    const [prompt, setPrompt] = useState('');
    const [connectionId, setConnectionId] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [model, setModel] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [apiBaseUrl, setApiBaseUrl] = useState('');

    // Reset connection when integration changes
    useEffect(() => {
        setConnectionId('');
    }, [integrationId]);

    // Session state
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [feed, setFeed] = useState<FeedEntry[]>([]);
    const [status, setStatus] = useState<'idle' | 'running' | 'waiting' | 'done' | 'error'>('idle');
    const [pendingQuestion, setPendingQuestion] = useState<{ id: string; message: string } | null>(null);

    const feedRef = useRef<HTMLDivElement>(null);
    const entryId = useRef(0);
    const abortRef = useRef<AbortController | null>(null);
    const sessionIdRef = useRef<string | null>(null);

    // Auto-scroll feed
    useEffect(() => {
        if (feedRef.current) {
            feedRef.current.scrollTop = feedRef.current.scrollHeight;
        }
    }, [feed]);

    const addEntry = useCallback((event: SseEvent) => {
        setFeed((prev) => [...prev, { ...event, id: entryId.current++ }]);
    }, []);

    const streamEvents = useCallback(
        async (sid: string) => {
            const abort = new AbortController();
            abortRef.current = abort;

            try {
                const res = await fetch(`${AGENT_BASE}/session/${sid}/events`, {
                    signal: abort.signal
                });

                if (!res.ok || !res.body) {
                    setStatus('error');
                    addEntry({ type: 'error', message: `Failed to connect to event stream (${res.status})` });
                    return;
                }

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';

                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        try {
                            const event = JSON.parse(line.slice(6)) as SseEvent;

                            if (event.type === 'question') {
                                setPendingQuestion({ id: event.question_id, message: event.message });
                                setStatus('waiting');
                            } else if (event.type === 'done') {
                                setStatus('done');
                                setPendingQuestion(null);
                            } else if (event.type === 'error') {
                                setStatus('error');
                                setPendingQuestion(null);
                            }

                            if (event.type !== 'session') {
                                addEntry(event);
                            }
                        } catch {
                            // malformed line, skip
                        }
                    }
                }
            } catch (err) {
                if ((err as Error).name !== 'AbortError') {
                    setStatus('error');
                    addEntry({ type: 'error', message: (err as Error).message });
                }
            }
        },
        [addEntry]
    );

    const handleBuild = useCallback(async () => {
        if (!prompt.trim() || !connectionId || !secretKey) return;

        abortRef.current?.abort();
        setFeed([]);
        setPendingQuestion(null);
        setStatus('running');
        sessionIdRef.current = null;

        try {
            const res = await fetch(`${AGENT_BASE}/build`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt.trim(),
                    nango_base_url: `https://api-${env}.nango.dev`,
                    nango_secret_key: secretKey,
                    environment: env,
                    connection_id: connectionId,
                    integration_id: integrationId || undefined,
                    model: model.trim() || undefined,
                    api_key: apiKey.trim() || undefined,
                    api_base_url: apiBaseUrl.trim() || undefined
                })
            });

            if (!res.ok) {
                const err = (await res.json()) as { error: string };
                setStatus('error');
                addEntry({ type: 'error', message: err.error || 'Failed to start build' });
                return;
            }

            const { session_id } = (await res.json()) as { session_id: string };
            setSessionId(session_id);
            sessionIdRef.current = session_id;
            void streamEvents(session_id);
        } catch (err) {
            setStatus('error');
            addEntry({ type: 'error', message: (err as Error).message });
        }
    }, [prompt, connectionId, secretKey, integrationId, model, apiKey, apiBaseUrl, env, streamEvents, addEntry]);

    const handleAnswer = useCallback(
        async (answer: string) => {
            if (!sessionIdRef.current) return;
            setPendingQuestion(null);
            setStatus('running');
            addEntry({ type: 'progress', message: `You: ${answer}` });

            await fetch(`${AGENT_BASE}/session/${sessionIdRef.current}/answer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answer })
            });
        },
        [addEntry]
    );

    const handleReset = useCallback(() => {
        abortRef.current?.abort();
        setFeed([]);
        setSessionId(null);
        setPendingQuestion(null);
        setStatus('idle');
    }, []);

    const isRunning = status === 'running';
    const isWaiting = status === 'waiting';
    const isDone = status === 'done';
    const isActive = isRunning || isWaiting;
    const canBuild = !isActive && prompt.trim() && connectionId && secretKey;

    return (
        <DashboardLayout>
            <Helmet>
                <title>Function Builder - Nango</title>
            </Helmet>

            <div className="flex flex-col gap-6 max-w-3xl">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
                            <Bot className="size-5" />
                            Function Builder
                        </h2>
                        <p className="text-body-small-regular text-text-light-gray">
                            Describe what you want to build — the agent writes, deploys, and tests it for you.
                        </p>
                    </div>
                    {(isActive || isDone || status === 'error') && (
                        <Button variant="secondary" size="sm" onClick={handleReset}>
                            <RotateCcw className="size-3.5" />
                            Reset
                        </Button>
                    )}
                </div>

                {/* Form */}
                <div className="flex flex-col gap-3 rounded-md border border-border-gray p-4">
                    <Textarea
                        placeholder="Build a Nango action that creates a HubSpot contact with name and email..."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        disabled={isActive}
                        rows={3}
                        className="text-body-small-regular resize-none"
                    />

                    <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                            <label className="text-body-small-medium text-text-light-gray">Integration</label>
                            <Select value={integrationId} onValueChange={setIntegrationId} disabled={isActive}>
                                <SelectTrigger className="w-full h-8 text-body-small-regular">
                                    <SelectValue placeholder="Select integration..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {integrations.map((i) => (
                                        <SelectItem key={i.unique_key} value={i.unique_key}>
                                            {i.unique_key}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-body-small-medium text-text-light-gray">Connection</label>
                            <Select value={connectionId} onValueChange={setConnectionId} disabled={isActive || !integrationId}>
                                <SelectTrigger className="w-full h-8 text-body-small-regular">
                                    <SelectValue placeholder={integrationId ? 'Select connection...' : 'Select integration first'} />
                                </SelectTrigger>
                                <SelectContent>
                                    {connections.map((c) => (
                                        <SelectItem key={c.connection_id} value={c.connection_id}>
                                            {c.connection_id}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Advanced toggle */}
                    <button
                        onClick={() => setShowAdvanced((v) => !v)}
                        className="flex items-center gap-1 text-body-small-regular text-text-tertiary hover:text-text-primary transition-colors w-fit"
                    >
                        {showAdvanced ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        Advanced
                    </button>

                    {showAdvanced && (
                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1">
                                <label className="text-body-small-medium text-text-light-gray">Model override</label>
                                <Input
                                    placeholder="moonshot/kimi-k2.5"
                                    value={model}
                                    onChange={(e) => setModel(e.target.value)}
                                    disabled={isActive}
                                    className="h-8 text-body-small-regular"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-body-small-medium text-text-light-gray">API Key override</label>
                                <Input
                                    type="password"
                                    placeholder="Uses server default"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    disabled={isActive}
                                    className="h-8 text-body-small-regular"
                                />
                            </div>
                            <div className="flex flex-col gap-1 col-span-2">
                                <label className="text-body-small-medium text-text-light-gray">Base URL override</label>
                                <Input
                                    placeholder="https://opencode.ai/zen/v1"
                                    value={apiBaseUrl}
                                    onChange={(e) => setApiBaseUrl(e.target.value)}
                                    disabled={isActive}
                                    className="h-8 text-body-small-regular"
                                />
                            </div>
                        </div>
                    )}

                    <Button variant="primary" size="sm" onClick={handleBuild} loading={isRunning} disabled={!canBuild} className="w-full">
                        {!isRunning && <Bot className="size-4" />}
                        {isRunning ? 'Building...' : 'Build with AI'}
                    </Button>
                </div>

                {/* Live feed */}
                {feed.length > 0 && (
                    <div className="flex flex-col gap-0">
                        {/* Status bar */}
                        <div className="flex items-center gap-2 mb-2">
                            {isRunning && <Loader className="size-3.5 text-text-tertiary animate-spin" />}
                            {isWaiting && <Bot className="size-3.5 text-text-tertiary" />}
                            {isDone && <CheckCircle2 className="size-3.5 text-success-400" />}
                            {status === 'error' && <XCircle className="size-3.5 text-alert-400" />}
                            <span className="text-body-small-medium text-text-tertiary">
                                {isRunning && 'Building...'}
                                {isWaiting && 'Waiting for your answer'}
                                {isDone && 'Complete'}
                                {status === 'error' && 'Error'}
                                {status === 'idle' && ''}
                            </span>
                            {sessionId && <span className="ml-auto font-code text-xs text-text-tertiary">{sessionId.slice(0, 8)}</span>}
                        </div>

                        {/* Feed scroll area */}
                        <div
                            ref={feedRef}
                            className="rounded-md border border-border-gray bg-active-bg p-3 max-h-[520px] overflow-y-auto flex flex-col gap-0.5"
                        >
                            {feed.map((entry) => {
                                if (entry.type === 'progress') {
                                    return <ProgressLine key={entry.id} message={entry.message} />;
                                }
                                if (entry.type === 'code') {
                                    return <CodeBlock key={entry.id} language={entry.language} content={entry.content} />;
                                }
                                if (entry.type === 'deploy_result' || entry.type === 'run_result') {
                                    return <ResultBadge key={entry.id} type={entry.type} status={entry.status} data={entry.data} />;
                                }
                                if (entry.type === 'question') {
                                    return (
                                        <QuestionCard
                                            key={entry.id}
                                            message={entry.message}
                                            onAnswer={handleAnswer}
                                            disabled={!isWaiting || pendingQuestion?.id !== entry.question_id}
                                        />
                                    );
                                }
                                if (entry.type === 'done') {
                                    return <DoneCard key={entry.id} message={entry.message} />;
                                }
                                if (entry.type === 'error') {
                                    return (
                                        <div key={entry.id} className="flex items-start gap-2 text-body-small-regular text-alert-400 py-0.5">
                                            <XCircle className="size-3.5 shrink-0 mt-0.5" />
                                            <span className="break-all">{entry.message}</span>
                                        </div>
                                    );
                                }
                                return null;
                            })}
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
};
