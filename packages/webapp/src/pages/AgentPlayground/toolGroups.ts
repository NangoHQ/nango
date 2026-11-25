import { isInterrupted, isShown } from './replyOutcome';
import { isSetUpPart } from './setUpTool';

import type { PlaygroundMessage } from '../../store/agentPlaygroundChat';
import type { AgentPlaygroundSessionCreated } from '@nangohq/types';
import type { DynamicToolUIPart, TextUIPart } from 'ai';

export type ReplyEntry = { kind: 'text'; key: string; part: TextUIPart } | { kind: 'tool'; key: string; part: DynamicToolUIPart };

export type ReplyItem =
    | ReplyEntry
    | { kind: 'group'; key: string; calls: DynamicToolUIPart[]; entries: ReplyEntry[] }
    | { kind: 'session'; key: string; created: AgentPlaygroundSessionCreated };

// A call the user has to act on, or acted on, stays on its own row.
export function needsOwnRow(part: DynamicToolUIPart, stoppedToolCall: DynamicToolUIPart | undefined): boolean {
    return (
        part === stoppedToolCall ||
        part.toolName === 'nango_create_connection' ||
        isSetUpPart(part) ||
        (part.approval !== undefined && !part.approval.isAutomatic) ||
        isInterrupted(part)
    );
}

export function groupReplyParts(parts: PlaygroundMessage['parts'], stoppedToolCall: DynamicToolUIPart | undefined): ReplyItem[] {
    const items: ReplyItem[] = [];
    let run: ReplyEntry[] = [];
    const flush = () => {
        const calls = run.flatMap((entry) => (entry.kind === 'tool' ? [entry.part] : []));
        const lastCall = run.map((entry) => entry.kind).lastIndexOf('tool');
        const [firstCall] = calls;
        if (calls.length > 1 && firstCall) {
            // Text after the last call is the answer, so it stays outside the group.
            items.push({ kind: 'group', key: firstCall.toolCallId, calls, entries: run.slice(0, lastCall + 1) });
            items.push(...run.slice(lastCall + 1));
        } else {
            items.push(...run);
        }
        run = [];
    };

    parts.forEach((part, index) => {
        if (part.type === 'text') {
            if (isShown(part)) {
                run.push({ kind: 'text', key: `text-${index}`, part });
            }
            return;
        }
        if (part.type === 'data-session') {
            flush();
            items.push({ kind: 'session', key: `session-${index}`, created: part.data });
            return;
        }
        if (part.type !== 'dynamic-tool') {
            return;
        }
        if (needsOwnRow(part, stoppedToolCall)) {
            flush();
            items.push({ kind: 'tool', key: part.toolCallId, part });
            return;
        }
        run.push({ kind: 'tool', key: part.toolCallId, part });
    });
    flush();
    return items;
}
