export interface Field {
    id: string | number;
    name: string;
    type: string;
    alias?: string;
}

export interface Option {
    id: number;
    archived: string;
    createdDate: string | null;
    archivedDate: string | null;
    name: string;
}

export interface ListField {
    fieldId: number;
    manageable: string;
    multiple: string;
    name: string;
    options: Option[];
    alias?: string;
}
