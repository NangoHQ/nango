import type { NangoModel, NangoModelField, NangoYamlModel, NangoYamlModelFields } from '@nangohq/types';
import { getNativeDataTypeOrValue, isJsOrTsType } from './helpers.js';
import { ParserError } from './errors.js';

export class ModelsParser {
    parsed = new Map<string, NangoModel>();
    references = new Set<string>();
    errors: ParserError[] = [];
    warnings: ParserError[] = [];

    raw: NangoYamlModel;

    constructor({ raw }: { raw: NangoYamlModel }) {
        this.raw = raw;
    }

    parseAll() {
        for (const [name, fields] of Object.entries(this.raw)) {
            if (this.parsed.has(name)) {
                continue;
            }

            this.parseOne({ name, fields });
        }
    }

    get(name: string): NangoModel | undefined {
        const parsed = this.parsed.get(name);
        if (!parsed) {
            return undefined;
        }

        return parsed;
    }

    parseOne({ name, fields }: { name: string; fields: NangoYamlModelFields }): void {
        const parsed = this.parseFields({ fields, parent: name });
        if (parsed) {
            this.parsed.set(name, { name, fields: parsed });
        }
    }

    ifModelParse({ name, parent }: { name: string; parent: string }): true | false {
        if (this.references.has(`${parent}-${name}`) || parent === name) {
            this.references.add(`${parent}-${name}`);
            this.warnings.push(new ParserError({ code: 'cyclic', message: `Cyclic import ${parent}->${name}`, path: [parent, name] }));
            return true;
        }

        // Previously parsed skip things
        const has = this.parsed.get(name);
        if (has) {
            return true;
        }

        // Model does not exists but that could just mean string literal
        if (!this.raw[name]) {
            this.warnings.push(
                new ParserError({ code: 'model_not_found', message: `Model "${name}" is not defined, using as string literal`, path: [parent, name] })
            );
            return false;
        }

        // At this point we are sure it's a Model
        this.parseOne({ name, fields: this.raw[name]! });
        return true;
    }

    parseFields({ fields, parent }: { fields: NangoYamlModelFields; parent: string }): NangoModelField[] {
        const parsed: NangoModelField[] = [];
        let dynamicField: NangoModelField | null = null;

        for (const [name, value] of Object.entries(fields)) {
            // Special key to extends models
            if (name === '__extends') {
                const extendedModels = (value as string).split(',');

                for (const extendedModel of extendedModels) {
                    const trimmed = extendedModel.trim();
                    const isModel = this.ifModelParse({ name: trimmed, parent });
                    if (!isModel) {
                        this.errors.push(
                            new ParserError({
                                code: 'model_extends_not_found',
                                message: `Model "${parent}" is extending "${trimmed}", but it does not exists`,
                                path: [parent, name]
                            })
                        );
                        continue;
                    }

                    // Merge parent
                    const extendedFields = this.parsed.get(trimmed)!;
                    for (const field of extendedFields.fields) {
                        if (field.dynamic) {
                            dynamicField = field;
                        } else {
                            parsed.push(field);
                        }
                    }
                }
                continue;
            }

            // Array of unknown
            if (Array.isArray(value)) {
                const acc = this.parseFields({ fields: value as unknown as NangoYamlModelFields, parent });
                if (!acc) {
                    this.errors.push(new ParserError({ code: 'failed_to_parse_array', message: `Failed to parse array in "${parent}"`, path: [parent, name] }));
                    continue;
                }

                parsed.push({ name, value: acc, array: true });
                continue;
            }

            // Standard data types that requires no change
            if (typeof value === 'boolean' || typeof value === 'number' || value === null) {
                parsed.push({ name, value, tsType: true });
                continue;
            }

            // Special case for literal objects
            if (typeof value === 'object') {
                const acc = this.parseFields({ fields: value, parent });
                if (!acc) {
                    this.errors.push(
                        new ParserError({ code: 'failed_to_parse_object', message: `Failed to parse object in "${parent}"`, path: [parent, name] })
                    );
                    continue;
                }

                parsed.push({ name, value: acc });
                continue;
            }

            // Special key for dynamic interface `[key: string]: *`
            if (name === '__string') {
                dynamicField = { name, value, dynamic: true };
                continue;
            }

            // Union type will be split and feed back to the parser
            if (value.includes('|')) {
                // union
                const types = value.split('|').map((v) => v.trim());
                const acc = this.parseFields({ fields: types as unknown as NangoYamlModelFields, parent });
                if (!acc) {
                    this.errors.push(new ParserError({ code: 'failed_to_parse_union', message: `Failed to parse union in "${parent}"`, path: [parent, name] }));
                    continue;
                }

                parsed.push({ name, value: acc, union: true });
                continue;
            }

            // At this point it's a regular string but it can still be:
            // - typescript array
            // - native data type (null, true, false)
            // - model
            const isArray = value.endsWith('[]');
            const valueClean = getNativeDataTypeOrValue(isArray ? value.substring(0, value.length - 2) : value);

            // Native data type
            if (typeof valueClean !== 'string') {
                parsed.push({ name, value: valueClean, tsType: true, array: isArray });
                continue;
            }

            if (isJsOrTsType(valueClean)) {
                parsed.push({ name, value: valueClean, tsType: true, array: isArray });
                continue;
            }

            // Model name
            const isModel = this.ifModelParse({ name: valueClean, parent });
            if (isModel) {
                parsed.push({ name, value, model: true });
                continue;
            }

            // Literal string
            parsed.push({ name, value: valueClean, array: isArray });
        }

        if (dynamicField) {
            parsed.push(dynamicField);
        }

        return parsed;
    }
}
