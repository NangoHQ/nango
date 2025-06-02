import { Err, Ok } from './result.js';

import type { Result } from '@nangohq/types';
import type { JSONSchema7, JSONSchema7Definition } from 'json-schema';

export function getDefinition(name: string, rootSchema: JSONSchema7): Result<JSONSchema7Definition> {
    const schema = rootSchema.definitions?.[name];
    if (!schema || typeof schema !== 'object') {
        return Err(new Error(`json_schema doesn't contain model "${name}"`));
    }
    return Ok(schema);
}

/**
 * Gets all definitions recursively from a JSON schema (the top level definition and all its references)
 */
export function getDefinitionsRecursively(
    name: string,
    rootSchema: JSONSchema7,
    visitedDefinitions: Set<JSONSchema7Definition>
): Result<Record<string, JSONSchema7Definition>> {
    const definitions: Record<string, JSONSchema7Definition> = {};

    const schema = getDefinition(name, rootSchema);
    if (schema.isErr()) {
        return Err(schema.error);
    }

    if (visitedDefinitions.has(schema.value)) {
        return Ok(definitions);
    }

    definitions[name] = schema.value;
    visitedDefinitions.add(schema.value);

    const references = findReferencesInSchema(schema.value, rootSchema);
    for (const reference of references) {
        const definitionsResult = getDefinitionsRecursively(reference, rootSchema, visitedDefinitions);
        if (definitionsResult.isErr()) {
            return Err(definitionsResult.error);
        }

        for (const [name, definition] of Object.entries(definitionsResult.value)) {
            definitions[name] = definition;
        }
    }

    return Ok(definitions);
}

/**
 * Finds all references in a JSON schema.
 */
function findReferencesInSchema(schema: JSONSchema7Definition, rootSchema: JSONSchema7): string[] {
    if (typeof schema !== 'object' || schema === null) {
        return [];
    }

    if (schema.$ref) {
        const reference = schema.$ref.replace('#/definitions/', '');
        return [reference];
    }

    const references: string[] = [];

    if (schema.properties) {
        for (const property of Object.values(schema.properties)) {
            references.push(...findReferencesInSchema(property, rootSchema));
        }
    }

    if (schema.items) {
        if (Array.isArray(schema.items)) {
            for (const item of schema.items) {
                references.push(...findReferencesInSchema(item, rootSchema));
            }
        } else {
            references.push(...findReferencesInSchema(schema.items, rootSchema));
        }
    }

    const complexSchemas = schema.oneOf || schema.anyOf || schema.allOf;
    if (complexSchemas) {
        for (const complexSchema of complexSchemas) {
            references.push(...findReferencesInSchema(complexSchema, rootSchema));
        }
    }

    if (schema.definitions) {
        for (const property of Object.values(schema.definitions)) {
            references.push(...findReferencesInSchema(property, rootSchema));
        }
    }

    return references;
}
