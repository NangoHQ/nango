import type { NangoAction, BamboohrField } from '../../models';
import type { Field, ListField, Option } from '../types';

export default async function runAction(nango: NangoAction): Promise<BamboohrField[]> {
    const response = await nango.get<Field[]>({
        endpoint: '/v1/meta/fields',
        headers: {
            Accept: 'application/json'
        }
    });

    const { data } = response;

    const listFieldResponse = await nango.get<ListField[]>({
        endpoint: '/v1/meta/lists',
        headers: {
            Accept: 'application/json'
        }
    });

    const { data: listData } = listFieldResponse;

    const fields = mapFields({ fields: data, listData });

    return fields;
}

function mapFields({ fields, listData }: { fields: Field[]; listData: ListField[] }): BamboohrField[] {
    const mappedFields: BamboohrField[] = [];
    const basicFields = fields.filter((field) => field.alias && field.id && !String(field.id).includes('.'));

    for (const field of basicFields) {
        const listField = listData.find((list) => list.fieldId === field.id);
        const mappedField: BamboohrField = {
            id: String(field.id),
            name: field.name,
            type: field.type
        };

        if (field.alias) {
            mappedField.alias = field.alias;
        }

        if (listField) {
            mappedField.options = listField.options.map((option: Option) => {
                return {
                    id: option.id,
                    name: option.name
                };
            });
        }

        mappedFields.push(mappedField);
    }

    return mappedFields;
}
