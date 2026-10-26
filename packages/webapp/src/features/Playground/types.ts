export type PlaygroundInput = { kind: 'none' } | { kind: 'object'; fields: InputField[] } | { kind: 'value'; field: InputField };

export interface InputField {
    name: string;
    type: string;
    description?: string;
    required: boolean;
    variants?: InputField[];
    // Scalar constraints from JSON Schema
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    enum?: unknown[];
}
