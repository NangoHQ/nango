import { ArrowUpRight, BookOpen, ChevronDown } from 'lucide-react';

import { LogoInverted } from '@/assets/LogoInverted';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { PlaygroundEventExplanation } from './PlaygroundEvent';
import { StatusIcon } from './ToolCallCard';

import type { AgentPlaygroundSessionCreated } from '@nangohq/types';

function sessionExplanation(reason: AgentPlaygroundSessionCreated['reason']): string {
    switch (reason) {
        case 'integrations_changed':
            return "A session's integrations are set when it starts, so the playground started a new session that includes your new integrations.";
        case 'connections_changed':
            return 'Your connections changed since the last session started, so the playground started a new session that uses your current connections.';
        case 'expired':
            return 'The last session expired. Playground sessions last an hour.';
        default:
            return 'The playground runs this chat on an agent session, created with the same POST /sessions call your app would make.';
    }
}

export const SessionNotice: React.FC<{ created: AgentPlaygroundSessionCreated; replaced: boolean }> = ({ created, replaced }) => {
    return (
        <Collapsible className="group/session flex flex-col gap-3">
            <CollapsibleTrigger className="mr-[17px] flex min-h-7 items-center gap-2 rounded-ds-xs text-left focus-visible:outline-offset-4 text-body-medium-regular text-text-secondary hover:text-text-default">
                <LogoInverted className="size-4 shrink-0 text-text-strong" />
                <span className="min-w-0 truncate">
                    <span className="text-body-medium-medium text-text-default">Session</span> {replaced ? 'restarted' : 'started'}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2 pl-2 text-body-small-regular">
                    <StatusIcon running={false} stopped={false} failed={false} />
                    <ChevronDown className="size-4 transition-transform group-data-[state=open]/session:rotate-180" />
                </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-3">
                <PlaygroundEventExplanation>{sessionExplanation(created.reason)}</PlaygroundEventExplanation>
                <CodeBlock
                    title="POST /sessions"
                    language="json"
                    code={JSON.stringify(created.request, null, 2)}
                    constrainHeight={false}
                    headerElement={
                        <a
                            href="https://nango.dev/docs/guides/agent-sessions"
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-s text-text-muted hover:text-text-default"
                        >
                            <BookOpen className="size-3.5" />
                            Agent sessions docs
                            <ArrowUpRight className="size-3.5" />
                        </a>
                    }
                />
            </CollapsibleContent>
        </Collapsible>
    );
};
