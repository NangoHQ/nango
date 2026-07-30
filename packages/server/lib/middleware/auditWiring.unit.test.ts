import express from 'express';
import { describe, expect, it } from 'vitest';

import { auditPositionViolations, collectRoutes, markAudit, markAuthz, unwiredAuditSpecs } from './auditWiring.js';

import type { AuditPolicy } from '@nangohq/types';
import type { RequestHandler } from 'express';

const policy: AuditPolicy = { kind: 'audit', resource: 'connection', action: 'deleted', scope: 'environment' };

// Fresh handler instances — every fixture handler must be a distinct reference so identity-based role
// detection isn't confused (a shared filler must not read as the auth handler).
const mw = (): RequestHandler => (_req, _res, next) => next();
const auth = (): RequestHandler => mw();
const authz = (): RequestHandler => markAuthz(mw());
const audit = (): RequestHandler => markAudit(mw(), policy);

function routerWith(handlers: RequestHandler[]) {
    const r = express.Router();
    r.route('/probe').post(...handlers);
    return r;
}

describe('audit wiring checker (unit — no server)', () => {
    it('accepts audit placed after auth and before authz', () => {
        const a = auth();
        const routes = collectRoutes(routerWith([a, audit(), authz(), mw()]));
        expect(auditPositionViolations(routes, new Set([a]))).toEqual([]);
    });

    it('flags audit placed AFTER authorization (denials would be lost)', () => {
        const a = auth();
        const routes = collectRoutes(routerWith([a, authz(), audit(), mw()]));
        const violations = auditPositionViolations(routes, new Set([a]));
        expect(violations).toHaveLength(1);
        expect(violations[0]).toContain('after authorization');
    });

    it('flags audit placed BEFORE auth (res.locals not populated)', () => {
        const a = auth();
        const routes = collectRoutes(routerWith([audit(), a, mw()]));
        const violations = auditPositionViolations(routes, new Set([a]));
        expect(violations).toHaveLength(1);
        expect(violations[0]).toContain('before auth');
    });

    it('accepts an audited route with no authorization at all (audit just needs to follow auth)', () => {
        const a = auth();
        const routes = collectRoutes(routerWith([a, audit(), mw()]));
        expect(auditPositionViolations(routes, new Set([a]))).toEqual([]);
    });

    it('detects a defined-but-unwired audit spec', () => {
        const wired = audit();
        const orphan = audit();
        const routes = collectRoutes(routerWith([mw(), wired]));
        expect(unwiredAuditSpecs(routes, { wired, orphan })).toEqual(['orphan']);
    });
});
