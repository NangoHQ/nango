import { basePublicUrl } from '@nangohq/utils';

import { toNangoFunction } from '../../../formatters/function.js';

import type { RetrievedProvider } from '../../../services/provider.service.js';
import type { GetProviderOutput } from './schema.js';

export function providerToMcp({ name, provider, templates }: RetrievedProvider): GetProviderOutput {
    const formattedTemplates = templates?.flatMap((template) => {
        const fn = toNangoFunction(template);
        return fn ? [fn] : [];
    });

    return {
        ...provider,
        name,
        logo_url: `${basePublicUrl}/images/template-logos/${name}.svg`,
        ...(formattedTemplates !== undefined ? { templates: formattedTemplates } : {})
    };
}
