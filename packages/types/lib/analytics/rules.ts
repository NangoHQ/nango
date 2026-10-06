import type { AnalyticsEventDefinition } from './catalogue.js';
import type * as z from 'zod';

const SURFACES = new Set(['web', 'cli', 'server']);
const PRIMITIVE_TYPES = new Set(['string', 'number', 'boolean', 'enum', 'literal']);
const SENDER_PROPERTIES = new Set(['surface', 'is_production']);
const EVENT_NAME = /^[a-z]+(_v[0-9]+)?:[a-z0-9]+(_[a-z0-9]+)*$/;
const SNAKE_CASE = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const BOOLEAN_NAME = /^(previous_)?(is|has)_/;

type Schema = z.ZodType;

function def(schema: Schema): Record<string, any> {
    return schema.def as unknown as Record<string, any>;
}

function unwrapOptional(schema: Schema): { schema: Schema; isOptional: boolean } {
    let current = schema;
    let isOptional = false;
    while (def(current)['type'] === 'optional') {
        isOptional = true;
        current = def(current)['innerType'];
    }
    return { schema: current, isOptional };
}

function isBoolean(schema: Schema): boolean {
    const d = def(schema);
    return d['type'] === 'boolean' || (d['type'] === 'literal' && (d['values'] as unknown[]).every((v) => typeof v === 'boolean'));
}

function isPrimitive(schema: Schema): boolean {
    const d = def(schema);
    if (!PRIMITIVE_TYPES.has(d['type'])) {
        return false;
    }
    return d['type'] !== 'literal' || (d['values'] as unknown[]).every((v) => ['string', 'number', 'boolean'].includes(typeof v));
}

function isEmptyRecord(schema: Schema): boolean {
    const d = def(schema);
    return d['type'] === 'record' && def(d['valueType'])['type'] === 'never';
}

function variants(schema: Schema): Record<string, Schema>[] | null {
    const d = def(schema);
    if (d['type'] === 'object') {
        return [d['shape']];
    }
    if (d['type'] === 'union') {
        const shapes = (d['options'] as Schema[]).map(variants);
        return shapes.some((s) => s === null) ? null : shapes.flatMap((s) => s!);
    }
    return null;
}

function propertyProblems(key: string, schema: Schema): string[] {
    if (!SNAKE_CASE.test(key)) {
        return [`property "${key}" is not snake_case`];
    }
    if (SENDER_PROPERTIES.has(key)) {
        return [`property "${key}" is added by the sender`];
    }
    const { schema: inner } = unwrapOptional(schema);
    if (!isPrimitive(inner)) {
        return [`property "${key}" is not a string, number or boolean`];
    }
    if (isBoolean(inner) && !BOOLEAN_NAME.test(key)) {
        return [`boolean property "${key}" needs an is_ or has_ prefix`];
    }
    return [];
}

function eventProblems(name: string, event: AnalyticsEventDefinition): string[] {
    const problems: string[] = [];
    if (!EVENT_NAME.test(name)) {
        problems.push('name is not lowercase category:object_action');
    }
    if (!SURFACES.has(event.surface)) {
        problems.push(`unknown surface "${event.surface}"`);
    }
    if (!event.insight.trim()) {
        problems.push('insight is empty');
    }
    if (!event.fires.trim()) {
        problems.push('fires is empty');
    }

    if (!isEmptyRecord(event.properties)) {
        const shapes = variants(event.properties);
        if (!shapes || shapes.some((shape) => Object.keys(shape).length === 0)) {
            problems.push('properties must be an object, or a union of objects, with named fields');
        } else {
            for (const shape of shapes) {
                for (const [key, schema] of Object.entries(shape)) {
                    problems.push(...propertyProblems(key, schema));
                }
            }
            const lacksSuccess = shapes.some((shape) => {
                const success = shape['is_success'];
                return !success || unwrapOptional(success).isOptional || !isBoolean(success);
            });
            if (name.endsWith('_complete') && lacksSuccess) {
                problems.push('complete events carry a required boolean is_success');
            }
        }
    } else if (name.endsWith('_complete')) {
        problems.push('complete events carry a required boolean is_success');
    }

    if (event.structured_properties) {
        if (def(event.structured_properties)['type'] !== 'object') {
            problems.push('structured_properties must be an object');
        }
        if (!event.structured_reason?.trim()) {
            problems.push('structured_properties need a structured_reason');
        }
    }

    return [...new Set(problems)].map((problem) => `${name}: ${problem}`);
}

export function findCatalogueProblems(catalogue: Record<string, AnalyticsEventDefinition>): string[] {
    return Object.entries(catalogue).flatMap(([name, event]) => eventProblems(name, event));
}
