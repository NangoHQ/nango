import { formatOperationTime } from './format';

import type { SearchOperationsData } from '@nangohq/types';

// Rounded up from Geist Mono 12px and Geist 13px: rounding down truncates values that fit.
const MONO_CHAR_WIDTH = 7.6;
const SANS_CHAR_WIDTH = 7.2;
const LOGO_WIDTH = 16 + 8;
// Must match the design-system TableCell padding.
const CELL_PADDING = 20;
const EDGE_PADDING = 10;

const TIME_ONLY_CHARS = 'HH:mm:ss'.length;
const DURATION_WIDTH = 76;
const STATUS_WIDTH = 104;
const TYPE_WIDTH = 150;
const PANEL_DURATION_WIDTH = 68;
const PANEL_STATUS_WIDTH = 96;
const PANEL_TYPE_WIDTH = 142;
const INTEGRATION_MIN_WIDTH = 120;
const FUNCTION_MIN_WIDTH = 120;
const CONNECTION_MIN_WIDTH = 100;
const CONNECTION_MAX_WIDTH = 320;

function widest(rows: SearchOperationsData[], get: (row: SearchOperationsData) => string | null | undefined): number {
    return rows.reduce((max, row) => Math.max(max, (get(row) ?? '').length), 0);
}

export function computeLogsGridTemplate(rows: SearchOperationsData[], { panelOpen, now = new Date() }: { panelOpen: boolean; now?: Date }): string {
    const timeChars = Math.max(
        TIME_ONLY_CHARS,
        widest(rows, (row) => formatOperationTime(row.createdAt, now))
    );
    const timestamp = Math.ceil(timeChars * MONO_CHAR_WIDTH) + CELL_PADDING + EDGE_PADDING;

    if (panelOpen) {
        return [`${timestamp}px`, `${PANEL_DURATION_WIDTH}px`, `${PANEL_STATUS_WIDTH}px`, `${PANEL_TYPE_WIDTH}px`, 'minmax(0,1fr)'].join(' ');
    }

    const integration = Math.max(INTEGRATION_MIN_WIDTH, Math.ceil(widest(rows, (row) => row.integrationName) * SANS_CHAR_WIDTH) + LOGO_WIDTH + CELL_PADDING);
    const connection = Math.min(
        CONNECTION_MAX_WIDTH,
        Math.max(CONNECTION_MIN_WIDTH, Math.ceil(widest(rows, (row) => row.connectionName) * MONO_CHAR_WIDTH) + CELL_PADDING + EDGE_PADDING)
    );

    // Integration and Connection have px maximums, so the grid fills them before Function.
    // They truncate only once Function is at its minimum.
    return [
        `${timestamp}px`,
        `${DURATION_WIDTH}px`,
        `${STATUS_WIDTH}px`,
        `${TYPE_WIDTH}px`,
        `minmax(0,${integration}px)`,
        `minmax(${FUNCTION_MIN_WIDTH}px,1fr)`,
        `minmax(${CONNECTION_MIN_WIDTH}px,${connection}px)`
    ].join(' ');
}
