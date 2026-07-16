import type { SearchOperationsData } from '@nangohq/types';
import type { Column } from '@tanstack/react-table';
import type { CSSProperties } from 'react';

// ProviderTag renders a logo (16px) + gap (6px); every cell has px-3 horizontal padding (24px total).
const INTEGRATION_LOGO_WIDTH = 22;
const CELL_HORIZONTAL_PADDING = 24;
// Advance width of one character in the cell font (Geist Mono at text-s / 12px). The values are monospace,
// so width scales linearly with character count. Measured ~7.56px; rounded up so we never under-size a
// column and truncate a value that would otherwise fit.
const MONO_CHAR_WIDTH = 7.6;

// flex-shrink weights. `canShrink` columns shrink first; the grow column keeps a tiny weight so it only
// gives up space once the others have hit their minSize, making the connection ID the last to truncate.
const SHRINK_FIRST = 1000;
const SHRINK_LAST = 1;

/**
 * Sizes the variable-width columns (Integration, Script, Connection) to fit their widest value, so nothing
 * truncates while it fits. getSize() clamps the result to each column's minSize, so short values never fall
 * below the header width.
 */
export function computeLogsColumnSizing(rows: SearchOperationsData[]): Record<string, number> {
    const maxChars = (get: (row: SearchOperationsData) => string | null | undefined) => rows.reduce((max, row) => Math.max(max, (get(row) || '').length), 0);

    return {
        integrationId: Math.ceil(maxChars((row) => row.integrationName) * MONO_CHAR_WIDTH) + INTEGRATION_LOGO_WIDTH + CELL_HORIZONTAL_PADDING,
        syncConfigId: Math.ceil(maxChars((row) => row.syncConfigName) * MONO_CHAR_WIDTH) + CELL_HORIZONTAL_PADDING,
        connectionId: Math.ceil(maxChars((row) => row.connectionName) * MONO_CHAR_WIDTH) + CELL_HORIZONTAL_PADDING
    };
}

/**
 * Flex layout for a table cell/header. Every column sits at its content width (flex-basis). The `canGrow`
 * column grows to absorb leftover space so short values leave no gap; when the row is too narrow, `canShrink`
 * columns give up space (and truncate) first, so the `canGrow` column is the last thing to be truncated.
 * Fixed columns never grow or shrink.
 */
export function getLogsColumnStyle(column: Column<SearchOperationsData, unknown>): CSSProperties {
    const size = column.getSize();
    const meta = column.columnDef.meta;
    const flexible = meta?.canShrink || meta?.canGrow;
    return {
        flexBasis: size,
        flexGrow: meta?.canGrow ? 1 : 0,
        flexShrink: meta?.canShrink ? SHRINK_FIRST : meta?.canGrow ? SHRINK_LAST : 0,
        minWidth: flexible ? (column.columnDef.minSize ?? 0) : size
    };
}
