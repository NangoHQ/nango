const MAX_ITEMS_SAMPLED = 200;
const MAX_KEYS = 40;
const MAX_DEPTH = 8;
const MAX_OUTLINE_CHARS = 4_000;
const LONG_STRING_CHARS = 200;
const SAMPLE_STRING_CHARS = 120;
const SAMPLE_ARRAY_ITEMS = 2;
const MAX_SAMPLE_CHARS = 2_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

interface Shape {
    seen: number;
    nulls: number;
    booleans: number;
    numbers: number;
    strings: { count: number; totalChars: number; dates: number };
    object: { count: number; keys: Map<string, Shape> } | null;
    array: { count: number; minLength: number; maxLength: number; items: Shape } | null;
}

export function describeResult(value: unknown): { shape: string; sample: unknown } {
    const sample = sampleValue(value);
    const sampleJson = JSON.stringify(sample) ?? 'null';
    return {
        shape: describeShape(value),
        sample: sampleJson.length > MAX_SAMPLE_CHARS ? `${sampleJson.slice(0, MAX_SAMPLE_CHARS)}… (sample truncated)` : sample
    };
}

export function describeShape(value: unknown): string {
    const outline = render(collect(emptyShape(), value, 0), 0);
    return outline.length > MAX_OUTLINE_CHARS ? `${outline.slice(0, MAX_OUTLINE_CHARS)}\n… (outline truncated)` : outline;
}

/** The same value with arrays cut to their first items and long strings clipped, to show real values and formats. */
export function sampleValue(value: unknown, depth = 0): unknown {
    if (typeof value === 'string') {
        return value.length > SAMPLE_STRING_CHARS ? `${value.slice(0, SAMPLE_STRING_CHARS)}… (${value.length} chars)` : value;
    }
    if (depth >= MAX_DEPTH || value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        const kept = value.slice(0, SAMPLE_ARRAY_ITEMS).map((item) => sampleValue(item, depth + 1));
        return value.length > SAMPLE_ARRAY_ITEMS ? [...kept, `… ${value.length - SAMPLE_ARRAY_ITEMS} more items`] : kept;
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sampleValue(child, depth + 1)]));
}

function emptyShape(): Shape {
    return { seen: 0, nulls: 0, booleans: 0, numbers: 0, strings: { count: 0, totalChars: 0, dates: 0 }, object: null, array: null };
}

function collect(shape: Shape, value: unknown, depth: number): Shape {
    shape.seen += 1;
    if (value === null || value === undefined) {
        shape.nulls += 1;
    } else if (typeof value === 'boolean') {
        shape.booleans += 1;
    } else if (typeof value === 'number') {
        shape.numbers += 1;
    } else if (typeof value === 'string') {
        shape.strings.count += 1;
        shape.strings.totalChars += value.length;
        if (ISO_DATE.test(value)) {
            shape.strings.dates += 1;
        }
    } else if (Array.isArray(value)) {
        shape.array ??= { count: 0, minLength: Infinity, maxLength: 0, items: emptyShape() };
        shape.array.count += 1;
        shape.array.minLength = Math.min(shape.array.minLength, value.length);
        shape.array.maxLength = Math.max(shape.array.maxLength, value.length);
        if (depth < MAX_DEPTH) {
            for (const item of value.slice(0, MAX_ITEMS_SAMPLED)) {
                collect(shape.array.items, item, depth + 1);
            }
        }
    } else if (typeof value === 'object') {
        shape.object ??= { count: 0, keys: new Map() };
        shape.object.count += 1;
        if (depth < MAX_DEPTH) {
            for (const [key, child] of Object.entries(value)) {
                let childShape = shape.object.keys.get(key);
                if (!childShape) {
                    childShape = emptyShape();
                    shape.object.keys.set(key, childShape);
                }
                collect(childShape, child, depth + 1);
            }
        }
    }
    return shape;
}

function render(shape: Shape, indent: number): string {
    const variants: string[] = [];
    if (shape.object) {
        variants.push(renderObject(shape.object, indent));
    }
    if (shape.array) {
        const { items, minLength, maxLength } = shape.array;
        const length = minLength === maxLength ? `${maxLength}` : `${minLength}..${maxLength}`;
        const item = items.seen === 0 ? 'unknown' : render(items, indent);
        const needsParens = item.includes(' | ');
        variants.push(`${needsParens ? `(${item})` : item}[] /* ${length} items */`);
    }
    if (shape.strings.count > 0) {
        const tags: string[] = [];
        if (shape.strings.dates === shape.strings.count) {
            tags.push('ISO date');
        }
        const avgChars = Math.round(shape.strings.totalChars / shape.strings.count);
        if (avgChars >= LONG_STRING_CHARS) {
            tags.push(`~${avgChars} chars`);
        }
        variants.push(tags.length > 0 ? `string /* ${tags.join(', ')} */` : 'string');
    }
    if (shape.numbers > 0) {
        variants.push('number');
    }
    if (shape.booleans > 0) {
        variants.push('boolean');
    }
    if (shape.nulls > 0) {
        variants.push('null');
    }
    return variants.length > 0 ? variants.join(' | ') : 'unknown';
}

function renderObject(object: NonNullable<Shape['object']>, indent: number): string {
    if (object.keys.size === 0) {
        return '{}';
    }
    const pad = '  '.repeat(indent + 1);
    const entries = [...object.keys.entries()];
    const lines = entries.slice(0, MAX_KEYS).map(([key, child]) => {
        const optional = child.seen < object.count ? '?' : '';
        const name = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
        return `${pad}${name}${optional}: ${render(child, indent + 1)};`;
    });
    if (entries.length > MAX_KEYS) {
        lines.push(`${pad}/* ${entries.length - MAX_KEYS} more keys */`);
    }
    return `{\n${lines.join('\n')}\n${'  '.repeat(indent)}}`;
}
