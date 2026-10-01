import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { canAllowUnverifiedWebhooks } from './allow-unverified.js';

const webhookDir = import.meta.dirname;

function routingScripts(): { name: string; source: string }[] {
    const index = fs.readFileSync(path.join(webhookDir, 'index.ts'), 'utf8');

    return [...index.matchAll(/export \{ default as (\w+) \} from '\.\/(.+)\.js';/g)].map(([, name, file]) => ({
        name: name!,
        source: fs.readFileSync(path.join(webhookDir, `${file}.ts`), 'utf8')
    }));
}

describe('canAllowUnverifiedWebhooks', () => {
    it('is false without a routing script', () => {
        expect(canAllowUnverifiedWebhooks({})).toBe(false);
    });

    it('is true exactly for the routing scripts that read allow_unverified_webhooks', () => {
        const scripts = routingScripts();
        expect(scripts.length).toBeGreaterThan(0);

        for (const { name, source } of scripts) {
            expect(canAllowUnverifiedWebhooks({ webhook_routing_script: name }), name).toBe(source.includes('allow_unverified_webhooks'));
        }
    });
});
