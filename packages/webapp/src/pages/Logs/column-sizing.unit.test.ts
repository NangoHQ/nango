import { describe, expect, it } from 'vitest';

import { computeLogsColumnSizing, getLogsColumnStyle } from './column-sizing.js';

import type { SearchOperationsData } from '@nangohq/types';
import type { Column } from '@tanstack/react-table';

// Keep in sync with column-sizing.ts. Duplicated here so the expected widths below read as plain arithmetic.
const CHAR = 7.6;
const LOGO = 22;
const PAD = 24;

function row(overrides: Partial<SearchOperationsData>): SearchOperationsData {
    return { integrationName: null, syncConfigName: null, connectionName: null, ...overrides } as SearchOperationsData;
}

describe('computeLogsColumnSizing', () => {
    it('sizes each column to fit its value (content + padding, plus a logo for integration)', () => {
        const sizing = computeLogsColumnSizing([row({ integrationName: 'github', syncConfigName: 'commits', connectionName: 'conn-1' })]);

        expect(sizing.integrationId).toBe(Math.ceil('github'.length * CHAR) + LOGO + PAD);
        expect(sizing.syncConfigId).toBe(Math.ceil('commits'.length * CHAR) + PAD);
        expect(sizing.connectionId).toBe(Math.ceil('conn-1'.length * CHAR) + PAD);
    });

    it('uses the widest value across all rows', () => {
        const sizing = computeLogsColumnSizing([
            row({ integrationName: 'short' }),
            row({ integrationName: 'google-calendar-getting-started' }),
            row({ integrationName: 'mid' })
        ]);

        expect(sizing.integrationId).toBe(Math.ceil('google-calendar-getting-started'.length * CHAR) + LOGO + PAD);
    });

    it('a longer value produces a wider column', () => {
        const shorter = computeLogsColumnSizing([row({ connectionName: 'a' })]);
        const longer = computeLogsColumnSizing([row({ connectionName: 'aaaaaaaaaaaaaaaaaaaa' })]);

        expect(longer.connectionId).toBeGreaterThan(shorter.connectionId);
    });

    it('treats missing values as empty, falling back to just the padding (and logo)', () => {
        const sizing = computeLogsColumnSizing([row({})]);

        expect(sizing.integrationId).toBe(LOGO + PAD);
        expect(sizing.syncConfigId).toBe(PAD);
        expect(sizing.connectionId).toBe(PAD);
    });

    it('returns the padding baseline for no rows', () => {
        const sizing = computeLogsColumnSizing([]);

        expect(sizing).toEqual({ integrationId: LOGO + PAD, syncConfigId: PAD, connectionId: PAD });
    });
});

describe('getLogsColumnStyle', () => {
    function column(meta: { canGrow?: boolean; canShrink?: boolean } | undefined, size = 200, minSize = 120) {
        return { getSize: () => size, columnDef: { meta, minSize } } as unknown as Column<SearchOperationsData, unknown>;
    }

    it('lays a fixed column at its size with no grow or shrink', () => {
        expect(getLogsColumnStyle(column(undefined, 180))).toEqual({ flexBasis: 180, flexGrow: 0, flexShrink: 0, minWidth: 180 });
    });

    it('lets a shrinkable column give up space first, down to its minSize', () => {
        const style = getLogsColumnStyle(column({ canShrink: true }, 200, 120));

        expect(style.flexBasis).toBe(200);
        expect(style.flexGrow).toBe(0);
        expect(style.flexShrink).toBeGreaterThan(1); // shrinks before the grow column
        expect(style.minWidth).toBe(120);
    });

    it('lets the grow column fill space and shrink only as a last resort', () => {
        const shrink = getLogsColumnStyle(column({ canShrink: true }, 200, 120));
        const grow = getLogsColumnStyle(column({ canGrow: true }, 200, 120));

        expect(grow.flexGrow).toBe(1);
        expect(grow.minWidth).toBe(120);
        expect(grow.flexShrink).toBeLessThan(Number(shrink.flexShrink)); // last to truncate
    });
});
