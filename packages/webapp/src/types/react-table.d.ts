import '@tanstack/react-table';

declare module '@tanstack/react-table' {
    interface ColumnMeta {
        canGrow?: boolean;
        widthPercentage?: number;
    }
}
