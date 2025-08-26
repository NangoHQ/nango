import type { StandardSchemaV1 } from '@standard-schema/spec';

export type { StandardSchemaV1 };

export type SchemaModel = StandardSchemaV1<{ id: string }>;
export type SchemaMetadata = StandardSchemaV1 | undefined;
export interface RawModel {
    [key: string]: unknown;
    id: string;
}
