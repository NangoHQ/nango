import { describe, expect, it } from 'vitest';

import { INTERRUPTED_CALL } from '../../store/agentPlaygroundChat.js';
import { groupReplyParts } from './toolGroups.js';

import type { PlaygroundMessage } from '../../store/agentPlaygroundChat.js';
import type { DynamicToolUIPart } from 'ai';

type Part = PlaygroundMessage['parts'][number];

function call(id: string, extra: Partial<DynamicToolUIPart> = {}): DynamicToolUIPart {
    return {
        type: 'dynamic-tool',
        toolName: 'google-mail__get_email',
        toolCallId: id,
        state: 'output-available',
        input: {},
        output: {},
        ...extra
    } as DynamicToolUIPart;
}

function text(value: string): Part {
    return { type: 'text', text: value };
}

function shape(parts: Part[], stopped?: DynamicToolUIPart) {
    return groupReplyParts(parts, stopped).map((item) => (item.kind === 'group' ? item.parts.map((part) => part.toolCallId) : item.key));
}

describe('groupReplyParts', () => {
    it('groups consecutive calls and keeps the answer after them', () => {
        expect(shape([{ type: 'step-start' }, call('a'), { type: 'step-start' }, call('b'), call('c'), text('Here are your emails')])).toEqual([
            ['a', 'b', 'c'],
            'text-5'
        ]);
    });

    it('leaves a single call ungrouped', () => {
        expect(shape([call('a'), text('Done')])).toEqual(['a', 'text-1']);
    });

    it('splits groups at text', () => {
        expect(shape([call('a'), call('b'), text('Now the calendar'), call('c'), call('d')])).toEqual([['a', 'b'], 'text-2', ['c', 'd']]);
    });

    it('ignores blank text between calls', () => {
        expect(shape([call('a'), text(' '), call('b')])).toEqual([['a', 'b']]);
    });

    it('keeps calls the user acts on out of groups', () => {
        const approval = call('approve', { state: 'approval-requested', approval: { id: 'x' } } as Partial<DynamicToolUIPart>);
        const approved = call('approved', { approval: { id: 'y', approved: true } } as Partial<DynamicToolUIPart>);
        const connect = call('connect', { toolName: 'nango_create_connection' });
        const interrupted = call('interrupted', { state: 'output-error', errorText: INTERRUPTED_CALL } as Partial<DynamicToolUIPart>);

        expect(shape([call('a'), call('b'), approved, connect, interrupted, call('c'), approval])).toEqual([
            ['a', 'b'],
            'approved',
            'connect',
            'interrupted',
            'c',
            'approve'
        ]);
    });

    it('groups calls the server approved automatically', () => {
        const auto = call('auto', { approval: { id: 'z', approved: true, isAutomatic: true } } as Partial<DynamicToolUIPart>);

        expect(shape([call('a'), auto])).toEqual([['a', 'auto']]);
    });

    it('keeps the stopped call on its own row', () => {
        const stopped = call('stopped', { state: 'input-available', output: undefined } as Partial<DynamicToolUIPart>);

        expect(shape([call('a'), call('b'), stopped], stopped)).toEqual([['a', 'b'], 'stopped']);
    });
});
