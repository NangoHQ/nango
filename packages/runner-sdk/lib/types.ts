import type { StandardSchemaV1 } from '@standard-schema/spec';

// Re-export for convenience
export type { StandardSchemaV1 };

// All validation libraries must implement Standard Schema
export type SchemaModel = StandardSchemaV1<{ id: string }>;
export type SchemaMetadata = StandardSchemaV1 | undefined;
export interface RawModel {
    [key: string]: unknown;
    id: string;
}
