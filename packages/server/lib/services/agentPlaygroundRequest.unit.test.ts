import { MockLanguageModelV4 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelKeyMissingError } from './agentPlaygroundModelError.js';
import { labelFirstMessage, resolveApps } from './agentPlaygroundRequest.js';

import type * as Utils from '@nangohq/utils';

const warning = vi.hoisted(() => vi.fn());
vi.mock('@nangohq/utils', async (importOriginal) => {
    const original = await importOriginal<typeof Utils>();
    return {
        ...original,
        getLogger: (name: string) => {
            const logger = original.getLogger(name);
            return name === 'AgentPlayground' ? Object.assign(Object.create(logger) as typeof logger, { warning }) : logger;
        }
    };
});

beforeEach(() => {
    warning.mockClear();
});

const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined }
};

function labellingModel(text: string): MockLanguageModelV4 {
    return new MockLanguageModelV4({
        doGenerate: () => Promise.resolve({ content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] })
    });
}

describe('resolveApps', () => {
    it('resolves apps by provider key or display name, whatever the case and spacing', () => {
        expect(resolveApps(['Gmail', 'GitHub', 'google calendar', 'HUBSPOT'])).toStrictEqual({
            providers: ['google-mail', 'github', 'google-calendar', 'hubspot'],
            hasUnsupportedProvider: false
        });
    });

    it('lists each provider once', () => {
        expect(resolveApps(['Gmail', 'gmail', 'google-mail']).providers).toStrictEqual(['google-mail']);
    });

    it('flags an app Nango does not support, and keeps the ones it does', () => {
        expect(resolveApps(['Linear', 'Not A Real App'])).toStrictEqual({ providers: ['linear'], hasUnsupportedProvider: true });
    });

    it('resolves nothing when the message names no app', () => {
        expect(resolveApps([])).toStrictEqual({ providers: [], hasUnsupportedProvider: false });
    });
});

describe('labelFirstMessage', () => {
    it('labels the message and resolves the apps it names', async () => {
        const model = labellingModel(JSON.stringify({ intent: 'copy tasks into issues', apps: ['Asana', 'Linear'] }));

        expect(await labelFirstMessage(model, 'Copy my Asana tasks into Linear')).toStrictEqual({
            intent: 'copy tasks into issues',
            providers: ['asana', 'linear'],
            hasUnsupportedProvider: false
        });
        expect(model.doGenerateCalls[0]?.prompt.at(-1)).toMatchObject({ role: 'user', content: [{ type: 'text', text: 'Copy my Asana tasks into Linear' }] });
    });

    it('gives no label when the model answers with something else', async () => {
        expect(await labelFirstMessage(labellingModel('Sure, here are your tasks'), 'Copy my Asana tasks into Linear')).toBeUndefined();
        expect(warning).toHaveBeenCalledOnce();
    });

    it('stays quiet when the deployment has no model key', async () => {
        const model = new MockLanguageModelV4({ doGenerate: () => Promise.reject(new ModelKeyMissingError()) });

        expect(await labelFirstMessage(model, 'Copy my Asana tasks into Linear')).toBeUndefined();
        expect(warning).not.toHaveBeenCalled();
    });
});
