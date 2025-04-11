import '@tanstack/react-table';

declare module '@tanstack/react-table' {
    interface ColumnMeta {
        isGrow?: boolean;
        widthPercentage?: number;
    }
}
