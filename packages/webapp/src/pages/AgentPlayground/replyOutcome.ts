import type { AgentPlaygroundMessageMetadata, AgentPlaygroundReplyOutcome } from '@nangohq/types';
import type { DynamicToolUIPart, UIMessage } from 'ai';

type PlaygroundMessage = UIMessage<AgentPlaygroundMessageMetadata>;

export function setReplyOutcome(messages: PlaygroundMessage[], outcome: AgentPlaygroundReplyOutcome | undefined): PlaygroundMessage[] {
    const last = messages.at(-1);
    if (!last || (!outcome && !last.metadata?.replyOutcome)) {
        return messages;
    }
    const metadata: AgentPlaygroundMessageMetadata = { ...last.metadata, replyOutcome: outcome };
    if (!outcome) {
        delete metadata.replyOutcome;
    }
    return [...messages.slice(0, -1), { ...last, metadata }];
}

function isShown(part: PlaygroundMessage['parts'][number]): boolean {
    return (part.type === 'text' && part.text !== '') || part.type === 'dynamic-tool';
}

export function hasReplyContent(message: PlaygroundMessage): boolean {
    return message.role === 'assistant' && message.parts.some(isShown);
}

export function isUnfinished(part: DynamicToolUIPart): boolean {
    return (
        part.state === 'input-streaming' ||
        part.state === 'input-available' ||
        part.state === 'approval-responded' ||
        (part.state === 'approval-requested' && part.approval.isAutomatic === true)
    );
}

export function unfinishedLastToolCall(message: PlaygroundMessage): DynamicToolUIPart | undefined {
    const last = message.parts.filter(isShown).at(-1);
    return last?.type === 'dynamic-tool' && isUnfinished(last) ? last : undefined;
}

export function hasVisibleContent(message: PlaygroundMessage): boolean {
    return Boolean(message.metadata?.integrationSetup || message.metadata?.replyOutcome) || hasReplyContent(message);
}
