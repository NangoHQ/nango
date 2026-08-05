import { describe, expect, it } from 'vitest';

import { sanitizeClickhouseError } from './error.js';

// Verbatim shapes captured from ClickHouse 26.3.3 inserting into the real audit table.
const EMAIL = 'secret.person@customer.example';

describe('sanitizeClickhouseError', () => {
    it('keeps a throwing-extractor error whole — it names the field and value, neither of which is PII', () => {
        const err = new Error(
            `Code: 376. DB::Exception: Cannot parse uuid NOT-A-UUID: Cannot parse UUID from String: while executing 'FUNCTION toUUID(JSONExtractString(event, 'id'_String) :: 1)': (CANNOT_PARSE_UUID)`
        );
        const out = sanitizeClickhouseError(err);
        expect(out).toContain('CANNOT_PARSE_UUID');
        expect(out).toContain('NOT-A-UUID');
        expect(out).toContain("JSONExtractString(event, 'id'");
    });

    it('strips the row a constraint violation quotes back', () => {
        const err = new Error(
            `Code: 469. DB::Exception: Constraint \`account_id_valid\` for table audit.audit_trail_events is violated at row 1. ` +
                `Expression: (JSONType(event, 'accountId') IN ('Int64', 'UInt64')). ` +
                `Column values: event = '{"id": "2222", "actor": {"display": "${EMAIL}"}, "context": {"ip": "203.0.113.77"}}': (VIOLATED_CONSTRAINT)`
        );
        const out = sanitizeClickhouseError(err);

        expect(out).not.toContain(EMAIL);
        expect(out).not.toContain('203.0.113.77');
        // Still diagnostic: the code, the constraint and the expression survive.
        expect(out).toContain('account_id_valid');
        expect(out).toContain("JSONType(event, 'accountId')");
        expect(out).toContain('[row omitted]');
    });

    it('strips the payload a format-parse error echoes wholesale', () => {
        const err = new Error(
            `Code: 27. DB::Exception: Cannot parse input: expected ',' before: 'actor":{"display":"${EMAIL}"},"context":{"ip":"203.0.113.77"}}': (at row 1)`
        );
        const out = sanitizeClickhouseError(err);

        expect(out).not.toContain(EMAIL);
        expect(out).not.toContain('203.0.113.77');
        expect(out).toContain('Code: 27');
    });

    it('bounds the length so an unrecognised shape cannot dump a payload either', () => {
        const out = sanitizeClickhouseError(new Error(`DB::Exception: ${EMAIL.repeat(200)}`));
        expect(out.length).toBeLessThanOrEqual(601);
    });

    it('accepts a non-Error', () => {
        expect(sanitizeClickhouseError('plain string')).toBe('plain string');
    });
});
