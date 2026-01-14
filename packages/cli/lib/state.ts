import Conf from 'conf';

interface CacheEntry {
    data: string[];
    timestamp: number;
}

interface CompletionCache {
    integrations?: CacheEntry;
    scripts?: Record<string, CacheEntry>;
}

interface StateSchema {
    lastIgnoreUpgrade?: number;
    completionCache?: CompletionCache;
}

const schema = {
    lastIgnoreUpgrade: {
        type: 'number'
    },
    completionCache: {
        type: 'object',
        properties: {
            integrations: {
                type: 'object',
                properties: {
                    data: { type: 'array', items: { type: 'string' } },
                    timestamp: { type: 'number' }
                }
            },
            scripts: { type: 'object' }
        }
    }
};
export const state = new Conf<StateSchema>({ projectName: 'nango', schema });
