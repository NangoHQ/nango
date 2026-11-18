import { INTERRUPTED_CALL } from '../../store/agentPlaygroundChat';
import { isShown } from './replyOutcome';
import { isSetUpPart } from './setUpTool';

import type { PlaygroundMessage } from '../../store/agentPlaygroundChat';
import type { DynamicToolUIPart, TextUIPart } from 'ai';

export type ReplyItem =
    | { kind: 'text'; key: string; part: TextUIPart }
    | { kind: 'tool'; key: string; part: DynamicToolUIPart }
    | { kind: 'group'; key: string; parts: DynamicToolUIPart[] };

// A call the user has to act on, or acted on, stays on its own row.
export function needsOwnRow(part: DynamicToolUIPart, stoppedToolCall: DynamicToolUIPart | undefined): boolean {
    return (
        part === stoppedToolCall ||
        part.toolName === 'nango_create_connection' ||
        isSetUpPart(part) ||
        (part.approval !== undefined && !part.approval.isAutomatic) ||
        (part.state === 'output-error' && part.errorText === INTERRUPTED_CALL)
    );
}

export function groupReplyParts(parts: PlaygroundMessage['parts'], stoppedToolCall: DynamicToolUIPart | undefined): ReplyItem[] {
    const items: ReplyItem[] = [];
    let run: DynamicToolUIPart[] = [];
    const flush = () => {
        const [first] = run;
        if (first) {
            items.push(run.length === 1 ? { kind: 'tool', key: first.toolCallId, part: first } : { kind: 'group', key: first.toolCallId, parts: run });
        }
        run = [];
    };

    parts.forEach((part, index) => {
        if (part.type === 'text') {
            if (isShown(part)) {
                flush();
                items.push({ kind: 'text', key: `text-${index}`, part });
            }
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
        run.push(part);
    });
    flush();
    return items;
}
