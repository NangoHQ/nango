import '@tanstack/react-table';

declare module '@tanstack/react-table' {
    interface ColumnMeta {
        // Logs table: column grows to fill leftover row space, and is the last to shrink/truncate.
        canGrow?: boolean;
        // Logs table: column is allowed to shrink (and truncate) first when the row runs out of horizontal space.
        canShrink?: boolean;
        widthPercentage?: number;
    }
}
