import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const VOCABULARY_FILE = path.join(DIR, '../../../../types/lib/audit-trail/event.ts');

// Emitters that name no single action in their own declaration. Listed rather than skipped, so a new
// unparseable middleware fails this suite instead of quietly dropping out of the ordering check below.
const NO_SINGLE_ACTION = [
    'auditSyncCommand', // maps req.body.command to one of four actions
    'auditMfaVerified', // action lives in the mfaVerifiedPolicy const
    'auditAuthManagedCallback', // signup or login, decided per request
    'auditAuthManagedVerification'
];

/** Action order per resource, read from AuditEventTable so this test cannot disagree with the vocabulary. */
function actionOrder(): Record<string, string[]> {
    const table = /interface AuditEventTable \{(.*?)\n\}/s.exec(fs.readFileSync(VOCABULARY_FILE, 'utf8'));
    if (!table) {
        throw new Error(`AuditEventTable not found in ${VOCABULARY_FILE}`);
    }
    const order: Record<string, string[]> = {};
    for (const row of table[1]!.matchAll(/^\s+(\w+):\s*((?:[^;]|\n)*);/gm)) {
        order[row[1]!] = row[2]!
            .split('|')
            .map((a) => a.trim().replace(/'/g, ''))
            .filter(Boolean);
    }
    return order;
}

const MOUNTABLE = /auditable<|maybeAuditable<|auditAuth<|:\s*RequestHandler/;

// appAuth's emitters are produced by calling a factory while the module loads, so its helpers have to be
// declared above them or evaluation hits them before initialisation. The rest of the folder builds its
// middlewares from object literals whose callbacks run per request, so helpers can sit below.
const HELPERS_FIRST = ['appAuth.middleware.ts'];
const FILE_RESOURCE: Record<string, string> = { apiKey: 'api_key', appAuth: 'app_auth', auditTrail: 'audit_trail' };

interface Decl {
    name: string;
    isMiddleware: boolean;
    resource: string | undefined;
    action: string | undefined;
}

/** Top-level declarations in source order. `resource`/`action` come from the declaration, not the filename. */
function declarations(source: string, fileResource: string): Decl[] {
    const out: Decl[] = [];
    for (const chunk of source.split(/^(?=export |function |const |async function |type |interface )/m)) {
        const decl = /^(export )?(async )?(function|const|type|interface|class) ([A-Za-z_$][\w$]*)/.exec(chunk);
        if (!decl) {
            continue;
        }
        const actions = new Set([...chunk.matchAll(/action: '([a-z_]+)'/g)].map((m) => m[1]!));
        const fromAuth = /auditAuth<[^>]*>\(\s*'([a-z_]+)'/.exec(chunk)?.[1];
        const fromPolicy = /AuditPolicy<'([a-z_]+)',\s*'([a-z_]+)'/.exec(chunk);
        if (fromAuth) {
            actions.add(fromAuth);
        }
        if (fromPolicy) {
            actions.add(fromPolicy[2]!);
        }
        out.push({
            name: decl[4]!,
            isMiddleware: Boolean(decl[1]) && MOUNTABLE.test(chunk),
            resource: /resource: '([a-z_]+)'/.exec(chunk)?.[1] ?? fromPolicy?.[1] ?? fileResource,
            action: actions.size === 1 ? [...actions][0] : undefined
        });
    }
    return out;
}

const ORDER = actionOrder();
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.middleware.ts'));
const parsed = new Map(
    files.map((f) => {
        const stem = f.replace('.middleware.ts', '');
        return [f, declarations(fs.readFileSync(path.join(DIR, f), 'utf8'), FILE_RESOURCE[stem] ?? stem)];
    })
);
const middlewares = [...parsed.values()].flat().filter((d) => d.isMiddleware);

describe('audit middleware file layout', () => {
    it('every resource in the vocabulary has at least one middleware', () => {
        const covered = new Set(middlewares.map((d) => d.resource));
        expect(Object.keys(ORDER).filter((r) => !covered.has(r))).toEqual([]);
    });

    it('only the emitters that genuinely name no single action are exempt from the ordering check', () => {
        const unresolved = middlewares.filter((d) => !d.action).map((d) => d.name);
        expect(unresolved.sort()).toEqual([...NO_SINGLE_ACTION].sort());
    });

    it.each([...parsed.keys()].filter((f) => !HELPERS_FIRST.includes(f)))('%s: every mounted middleware precedes every helper', (file) => {
        const decls = parsed.get(file)!;
        const lastMiddleware = decls.findLastIndex((d) => d.isMiddleware);
        const firstHelper = decls.findIndex((d) => !d.isMiddleware);
        expect(lastMiddleware).toBeGreaterThanOrEqual(0);
        if (firstHelper !== -1) {
            expect(firstHelper, `helper "${decls[firstHelper]!.name}" appears above a middleware`).toBeGreaterThan(lastMiddleware);
        }
    });

    it.each([...parsed.keys()])('%s: middlewares follow the action order declared in AuditEventTable', (file) => {
        const decls = parsed.get(file)!.filter((d) => d.isMiddleware);
        const unknown = decls.filter((d) => d.action && !ORDER[d.resource!]?.includes(d.action));
        expect(
            unknown.map((d) => `${d.name} (${d.resource}.${d.action})`),
            'action outside its resource vocabulary'
        ).toEqual([]);

        // Ordered per resource, since a file may host an emitter whose resource differs from its name.
        for (const resource of new Set(decls.map((d) => d.resource))) {
            const positions = decls
                .filter((d) => d.resource === resource && d.action)
                .map((d) => ({ name: d.name, index: ORDER[resource!]!.indexOf(d.action!) }));
            const indices = positions.map((p) => p.index);
            expect(indices, `${resource}: ${positions.map((p) => `${p.name}=${p.index}`).join(' ')}`).toEqual([...indices].sort((a, b) => a - b));
        }
    });

    it.each([...parsed.keys()].filter((f) => !HELPERS_FIRST.includes(f)))('%s: emitters with no single action come last', (file) => {
        const decls = parsed.get(file)!.filter((d) => d.isMiddleware);
        const lastResolved = decls.findLastIndex((d) => d.action);
        const firstUnresolved = decls.findIndex((d) => !d.action);
        if (firstUnresolved !== -1 && lastResolved !== -1) {
            expect(firstUnresolved, `"${decls[firstUnresolved]!.name}" names no single action, so it belongs below the ordered ones`).toBeGreaterThan(
                lastResolved
            );
        }
    });
});
