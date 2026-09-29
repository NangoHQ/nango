import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Helmet } from 'react-helmet';

import { Button, Textarea } from '@nangohq/design-system';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { useAgentPlaygroundChat } from '@/hooks/useAgentPlayground';
import { useMeta } from '@/hooks/useMeta';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';

import type { AgentPlaygroundToolCall, AgentPlaygroundUsage } from '@nangohq/types';

interface Turn {
    prompt: string;
    reply?: string;
    toolCalls?: AgentPlaygroundToolCall[];
    usage?: AgentPlaygroundUsage;
    error?: string;
}

export const AgentPlaygroundShow: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data: meta } = useMeta();
    const chat = useAgentPlaygroundChat(env);

    const [sessionId, setSessionId] = useState<string | undefined>();
    const [history, setHistory] = useState<unknown[]>([]);
    const [turns, setTurns] = useState<Turn[]>([]);
    const [prompt, setPrompt] = useState('');

    const send = async () => {
        const text = prompt.trim();
        if (!text || chat.isPending) {
            return;
        }

        setPrompt('');
        setTurns((prev) => [...prev, { prompt: text }]);

        try {
            const { data } = await chat.mutateAsync({
                sessionId,
                messages: history,
                prompt: text,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
            });
            setSessionId(data.sessionId);
            setHistory((prev) => [...prev, ...data.messages]);
            setTurns((prev) => [...prev.slice(0, -1), { prompt: text, reply: data.reply, toolCalls: data.toolCalls, usage: data.usage }]);
        } catch (err) {
            const message = (err as { json?: { error?: { message?: string } } }).json?.error?.message ?? 'The agent failed to answer';
            setTurns((prev) => [...prev.slice(0, -1), { prompt: text, error: message }]);
        }
    };

    const reset = () => {
        setSessionId(undefined);
        setHistory([]);
        setTurns([]);
    };

    if (meta && !meta.data.agentPlayground) {
        return (
            <DashboardLayout title="Agent Playground">
                <p className="text-text-secondary">The Agent Playground is not enabled for this account.</p>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout
            title="Agent Playground"
            titleActions={
                <Button variant="secondary" size="sm" onClick={reset} disabled={turns.length === 0 || chat.isPending}>
                    New chat
                </Button>
            }
        >
            <Helmet>
                <title>Agent Playground - Nango</title>
            </Helmet>

            <div className="flex flex-col gap-6">
                {turns.length === 0 && (
                    <p className="text-text-secondary">
                        Ask the agent to do something with this environment&apos;s connections. Each tool call it makes shows up below.
                    </p>
                )}

                {turns.map((turn, index) => (
                    <div key={index} className="flex flex-col gap-3">
                        <div className="self-end max-w-[80%] rounded-md bg-surface-raised px-3 py-2 text-text-default whitespace-pre-wrap">{turn.prompt}</div>

                        {turn.toolCalls?.map((call) => (
                            <ToolCallBlock key={call.id} call={call} />
                        ))}

                        {turn.reply !== undefined && <div className="max-w-[80%] text-text-default whitespace-pre-wrap">{turn.reply}</div>}
                        {turn.error && <div className="text-text-danger">{turn.error}</div>}
                        {turn.reply === undefined && !turn.error && <div className="text-text-secondary">Thinking…</div>}

                        {turn.usage && (
                            <div className="text-xs text-text-tertiary">
                                {turn.usage.inputTokens} in / {turn.usage.outputTokens} out tokens · {turn.usage.cachedModelCalls}/{turn.usage.modelCalls} model
                                calls from cache
                            </div>
                        )}
                    </div>
                ))}

                <form
                    className="flex flex-col gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void send();
                    }}
                >
                    <Textarea
                        value={prompt}
                        placeholder="List my latest Notion pages"
                        rows={3}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void send();
                            }
                        }}
                    />
                    <div className="self-end">
                        <Button type="submit" loading={chat.isPending} disabled={!prompt.trim()}>
                            Send
                        </Button>
                    </div>
                </form>
            </div>
        </DashboardLayout>
    );
};

const ToolCallBlock: React.FC<{ call: AgentPlaygroundToolCall }> = ({ call }) => {
    return (
        <Collapsible className="rounded-md border border-border-muted">
            <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
                <ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" />
                <span className="font-mono">{call.name}</span>
                <span className={call.isError ? 'text-text-danger' : 'text-text-tertiary'}>
                    {call.isError ? 'failed' : 'ok'} · {call.durationMs}ms
                </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-2 border-t border-border-muted px-3 py-2 text-xs">
                <div className="text-text-secondary">Input</div>
                <pre className="overflow-auto font-mono">{JSON.stringify(call.input, null, 2)}</pre>
                <div className="text-text-secondary">Output</div>
                <pre className="max-h-96 overflow-auto font-mono">{JSON.stringify(call.output, null, 2)}</pre>
            </CollapsibleContent>
        </Collapsible>
    );
};
