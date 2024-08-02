import type { NangoModel, NangoModelField } from '@nangohq/types';
import type { NangoSyncModel } from '../types';

export function isNewModel(model: NangoSyncModel | NangoModel): model is NangoModel {
    return 'fields' in model && model.fields.length > 0 && 'value' in model.fields[0];
}

export function getSyncResponse(model: NangoSyncModel | NangoModel) {
    let record = '';
    if (isNewModel(model)) {
        record = fieldsToTypescript({ fields: model.fields }).join('\n    ');
    } else {
        const tmp = JSON.stringify(legacyModelToObject(model), null, 2).slice(2);
        record = tmp.substring(0, tmp.length - 2);
    }
    return `{
  "records": [
    {
    ${record}
      "_nango_metadata": {
        "deleted_at": "<date | null>",
        "last_action": "ADDED | UPDATED | DELETED",
        "first_seen_at": "<date>",
        "cursor": "<string>",
        "last_modified_at": "<date>"
      }
    }
  ],
  "next_cursor": "MjAyMy0xMS0xN1QxMTo0NzoxNC40NDcrMDI6MDB8fDAz..."
}`;
}

export function legacyModelToObject(model: NangoSyncModel) {
    const obj: Record<string, any> = {};
    for (const field of model.fields) {
        obj[field.name] = field.type;
    }
    return obj;
}

export function modelToString(model: NangoSyncModel | NangoModel) {
    if (isNewModel(model)) {
        return `    {
${fieldsToTypescript({ fields: model.fields }).join('\n').replace(/^/gm, '    ')}
    }`;
    } else {
        return JSON.stringify(legacyModelToObject(model), null, 2).split('\n').join('\n').replace(/^/gm, '    ');
    }
}

/**
 * Initial logic from from model.service.ts
 */

const regQuote = /^[a-zA-Z0-9_]+$/;
export function shouldQuote(name: string) {
    return !regQuote.test(name);
}

export function fieldsToTypescript({ fields }: { fields: NangoModelField[] }) {
    const output: string[] = [];
    const dynamic = fields.find((field) => field.dynamic);

    // Insert dynamic key at the beginning
    if (dynamic) {
        output.push(`  [key: string]: ${fieldToTypescript({ field: dynamic })};`);
    }

    // Regular fields
    for (const field of fields) {
        if (field.dynamic) {
            continue;
        }
        if (Array.isArray(field.value) && !field.union && !field.array) {
            output.push(`  "${field.name}"${field.optional ? '?' : ''}: ${fieldToTypescript({ field: field })},`);
        } else {
            output.push(`  "${field.name}"${field.optional ? '?' : ''}: "<${fieldToTypescript({ field: field })}>",`);
        }
    }

    return output;
}

/**
 * Transform a field definition to its typescript equivalent
 */
export function fieldToTypescript({ field }: { field: NangoModelField }): string | boolean | null | undefined | number {
    if (Array.isArray(field.value)) {
        if (field.union) {
            return field.value.map((f) => fieldToTypescript({ field: f })).join(' | ');
        }
        if (field.array) {
            return `(${field.value.map((f) => fieldToTypescript({ field: f })).join(' | ')})[]`;
        }

        return `{${fieldsToTypescript({ fields: field.value }).join('\n')} }`;
    }
    if (field.model || field.tsType) {
        return `${field.value}${field.array ? '[]' : ''}`;
    }
    if (field.value === null) {
        return 'null';
    }
    if (typeof field.value === 'string') {
        return `'${field.value}${field.array ? '[]' : ''}'`;
    }
    return `${field.value}${field.array ? '[]' : ''}`;
}
