import { INTERRUPTED_CALL, settleAnsweredApprovals } from '../../store/agentPlaygroundChat';

import type { PlaygroundMessage } from '../../store/agentPlaygroundChat';
import type { AgentPlaygroundMessageMetadata, AgentPlaygroundReplyOutcome } from '@nangohq/types';
import type { DynamicToolUIPart } from 'ai';

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
    return (part.type === 'text' && part.text.trim() !== '') || part.type === 'dynamic-tool';
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

export function markStopped(messages: PlaygroundMessage[]): PlaygroundMessage[] {
    const last = messages.at(-1);
    const settled = last ? [...messages.slice(0, -1), settleAnsweredApprovals(last)] : messages;
    return setReplyOutcome(settled, { kind: 'stopped' });
}

function stoppedLastToolCall(message: PlaygroundMessage): DynamicToolUIPart | undefined {
    const last = message.parts.filter(isShown).at(-1);
    if (last?.type !== 'dynamic-tool') {
        return undefined;
    }
    return isUnfinished(last) || (last.state === 'output-error' && last.errorText === INTERRUPTED_CALL) ? last : undefined;
}

export function outcomeDisplay(message: PlaygroundMessage): {
    notice: AgentPlaygroundReplyOutcome | undefined;
    stoppedToolCall: DynamicToolUIPart | undefined;
} {
    const outcome = message.metadata?.replyOutcome;
    const stoppedToolCall = outcome?.kind === 'stopped' ? stoppedLastToolCall(message) : undefined;
    return { notice: stoppedToolCall ? undefined : outcome, stoppedToolCall };
}

export function hasVisibleContent(message: PlaygroundMessage): boolean {
    return Boolean(message.metadata?.integrationSetup || message.metadata?.replyOutcome) || hasReplyContent(message);
}
