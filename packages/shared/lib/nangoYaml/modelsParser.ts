import type { NangoModel, NangoModelField, NangoYamlModel, NangoYamlModelFields } from '@nangohq/types';
import { isJsOrTsType } from '../utils/utils.js';

export class ModelsParser {
    parsed = new Map<string, NangoModelField[]>();
    references = new Set<string>();
    errors: string[] = [];
    warnings: string[] = [];

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

        return { name, fields: parsed };
    }

    parseOne({ name, fields }: { name: string; fields: NangoYamlModelFields }): void {
        const parsed = this.parseFields({ fields, parent: name });
        if (parsed) {
            this.parsed.set(name, parsed);
        }
    }

    isModelParse({ name, parent }: { name: string; parent: string }): true | false {
        if (this.references.has(`${parent}-${name}`) || parent === name) {
            this.references.add(`${parent}-${name}`);
            this.warnings.push(`Cyclic import ${parent}->${name}`);
            return true;
        }

        // Previously parsed skip things
        const has = this.parsed.get(name);
        if (has) {
            return true;
        }

        // Model does not exists but that could just mean string literal
        if (!this.raw[name]) {
            this.warnings.push(`Model "${name}" is not defined, using as string literal`);
            return false;
        }

        // At this point we are sure it's a Model
        this.parseOne({ name, fields: this.raw[name]! });
        return true;
    }

    parseFields({ fields, parent }: { fields: NangoYamlModelFields; parent: string }): NangoModelField[] | undefined {
        const parsed: NangoModelField[] = [];
        let dynamicField: NangoModelField | null = null;

        for (const [name, value] of Object.entries(fields)) {
            if (name === '__extends') {
                const extendedModels = (value as string).split(',');

                for (const extendedModel of extendedModels) {
                    const trimmed = extendedModel.trim();
                    const isModel = this.isModelParse({ name: trimmed, parent });
                    if (!isModel) {
                        this.errors.push(`Model "${parent}" is extending "${trimmed}", but it does not exists`);
                        continue;
                    }

                    // Merge parent
                    const extendedFields = this.parsed.get(trimmed)!;
                    for (const field of extendedFields) {
                        if (field.dynamic) {
                            dynamicField = field;
                        } else {
                            parsed.push(field);
                        }
                    }
                }
            } else if (Array.isArray(value)) {
                const acc = this.parseFields({ fields: value as unknown as NangoYamlModelFields, parent });
                if (!acc) {
                    this.errors.push(`Failed to parse object in "${parent}"`);
                    continue;
                }

                parsed.push({ name, value: acc });
            } else if (typeof value === 'boolean' || typeof value === 'number' || value === null) {
                parsed.push({ name, value });
            } else if (typeof value === 'object') {
                const acc = this.parseFields({ fields: value, parent });
                if (!acc) {
                    this.errors.push(`Failed to parse object in "${parent}"`);
                    continue;
                }

                parsed.push({ name, value: acc });
            } else if (name === '__string') {
                dynamicField = { name, value, dynamic: true };
            } else if (isJsOrTsType(value)) {
                parsed.push({ name, value, tsType: true });
            } else {
                const isModel = this.isModelParse({ name: value, parent });
                if (isModel) {
                    parsed.push({ name, value, model: true });
                    continue;
                }

                parsed.push({ name, value });
            }
        }

        if (dynamicField) {
            parsed.push(dynamicField);
        }

        return parsed;
    }
}
