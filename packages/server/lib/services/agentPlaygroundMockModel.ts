import crypto from 'node:crypto';

import { MockLanguageModelV4 } from 'ai/test';

// Keep the real nango_tool_search call: mock mode is how the tool path gets exercised for free.
export function createMockModel(): MockLanguageModelV4 {
    const usage = {
        inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 0, text: 0, reasoning: undefined }
    };

    return new MockLanguageModelV4({
        modelId: 'mock',
        doGenerate: ({ prompt }) => {
            const last = prompt.at(-1);

            if (last?.role === 'tool') {
                const output = last.content.find((part) => part.type === 'tool-result')?.output;
                return Promise.resolve({
                    content: [{ type: 'text', text: `Mock reply. The tool returned:\n\n${JSON.stringify(output, null, 2)}` }],
                    finishReason: { unified: 'stop', raw: undefined },
                    usage,
                    warnings: []
                });
            }

            const text =
                last?.role === 'user'
                    ? last.content
                          .filter((part) => part.type === 'text')
                          .map((part) => part.text)
                          .join(' ')
                    : '';
            return Promise.resolve({
                content: [
                    {
                        type: 'tool-call',
                        toolCallId: crypto.randomUUID(),
                        toolName: 'nango_tool_search',
                        input: JSON.stringify({ query: text.slice(0, 255) || 'list tools' })
                    }
                ],
                finishReason: { unified: 'tool-calls', raw: undefined },
                usage,
                warnings: []
            });
        }
    });
}
