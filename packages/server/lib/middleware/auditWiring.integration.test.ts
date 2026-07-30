import { describe, expect, it } from 'vitest';

import { privateApi, webAuth } from '../routes.private.js';
import { apiAuth, publicAPI } from '../routes.public.js';
import * as auditSpecs from './audit.middleware.js';
import { auditPositionViolations, collectRoutes, unwiredAuditSpecs } from './auditWiring.js';

import type { RequestHandler } from 'express';

// The wiring invariant enforced across every real route at once — the single check that replaces the
// per-endpoint "a denied request is still recorded" integration tests. It only reads the built router
// table (no HTTP, no seeding); it lives in the integration project solely because importing the route
// graph currently opens a Postgres pool at module load. Once route→policy is exposed without importing
// the controller graph (the typed route builder), this can move to the pure-unit project.
describe('audit wiring — real route table', () => {
    const routes = [...collectRoutes(publicAPI), ...collectRoutes(privateApi)];
    const authHandlers = new Set<RequestHandler>([...apiAuth, ...webAuth]);

    it('installs every audit handler after auth and before authorization', () => {
        expect(auditPositionViolations(routes, authHandlers)).toEqual([]);
    });

    it('wires every exported audit spec to at least one route', () => {
        expect(unwiredAuditSpecs(routes, auditSpecs as Record<string, unknown>)).toEqual([]);
    });
});
