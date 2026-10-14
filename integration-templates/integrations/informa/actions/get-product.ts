import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    product: z
        .string()
        .describe(
            'Informa product code (e.g. INFORME_FINANCIERO, INFORME_ABREVIADO, FICHA, BALANCES). Must be enabled on the contract.'
        ),
    cif: z.string().describe('Spanish company/autónomo tax ID (NIF/CIF).'),
    formato: z.enum(['json', 'pdf']).optional().describe('Response format. Defaults to json.'),
    rai: z.boolean().optional().describe('Include RAI delinquency data when contracted.'),
    morosidad: z.boolean().optional().describe('Include additional delinquency modules when contracted.')
});

const OutputSchema = z.object({
    product: z.string(),
    cif: z.string(),
    formato: z.string(),
    data: z.unknown().describe('Raw Informa product payload (JSON object or PDF bytes when formato=pdf).')
});

const action = createAction({
    description:
        'Fetches an Informa EMPRESAS product by CIF (packaged reports or modular products). Does not fall back to another product if the request fails.',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/product', group: 'Products' },
    input: InputSchema,
    output: OutputSchema,

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        const formato = input.formato ?? 'json';
        const params: Record<string, string | boolean> = {
            product: input.product,
            cif: input.cif,
            formato
        };
        if (input.rai !== undefined) {
            params.rai = input.rai;
        }
        if (input.morosidad !== undefined) {
            params.morosidad = input.morosidad;
        }

        // https://www.informa.es/necesidades/api-empresas
        const response = await nango.get({
            endpoint: '/api/get-product',
            params,
            retries: 3,
            ...(formato === 'pdf' ? { responseType: 'arraybuffer' as const } : {})
        });

        return {
            product: input.product,
            cif: input.cif,
            formato,
            data: response.data
        };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
