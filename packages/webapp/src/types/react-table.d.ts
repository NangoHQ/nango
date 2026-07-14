import '@tanstack/react-table';

declare module '@tanstack/react-table' {
    interface ColumnMeta {
        canGrow?: boolean;
        widthPercentage?: number;
        // Logs table: column may shrink (and truncate) when the row runs out of horizontal space.
        // Non-shrink columns keep their content width, so a grow column is the last to give up space.
        canShrink?: boolean;
    }
}
