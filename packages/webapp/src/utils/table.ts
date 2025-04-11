import type { Header } from '@tanstack/react-table';

// Copied from
// https://github.com/TanStack/table/discussions/4179#discussioncomment-11895847

function getSize(size = 100, max = Number.MAX_SAFE_INTEGER, min = 40) {
    return Math.max(Math.min(size, max), min);
}

/**
 * Calculates the sizing of table columns and distributes available width proportionally.
 * This function acts as an extension for TanStack Table, ensuring proper column sizing
 * based on provided metadata, including `isGrow`, `widthPercentage`, and size constraints.
 *
 * @template DataType - The generic type of data used in the table rows.
 *
 * @param {Header<DataType, unknown>[]} columns - An array of column headers. Each header contains
 *   metadata about the column, including size, constraints, and growth behavior.
 * @param {number} totalWidth - The total width available for the table, including padding and margins.
 *
 * @returns {Record<string, number>} An object mapping column IDs to their calculated sizes.
 */
export const calculateTableSizing = (columns: Header<any, unknown>[], totalWidth: number): Record<string, number> => {
    let totalAvailableWidth = totalWidth;
    let totalIsGrow = 0;

    columns.forEach((header) => {
        const column = header.column.columnDef;
        if (!column.size) {
            if (!column.meta?.isGrow) {
                let calculatedSize = 100;
                if (column?.meta?.widthPercentage) {
                    calculatedSize = column.meta.widthPercentage * totalWidth * 0.01;
                } else {
                    calculatedSize = totalWidth / columns.length;
                }

                const size = getSize(calculatedSize, column.maxSize, column.minSize);

                column.size = size;
            }
        }

        if (column.meta?.isGrow) totalIsGrow += 1;
        else totalAvailableWidth -= getSize(column.size, column.maxSize, column.minSize);
    });

    const sizing: Record<string, number> = {};

    columns.forEach((header) => {
        const column = header.column.columnDef;
        if (column.meta?.isGrow) {
            let calculatedSize = 100;
            calculatedSize = Math.floor(totalAvailableWidth / totalIsGrow);
            const size = getSize(calculatedSize, column.maxSize, column.minSize);
            column.size = size;
        }

        sizing[`${column.id}`] = Number(column.size);
    });

    return sizing;
};
