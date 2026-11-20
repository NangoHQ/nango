import { basePublicUrl } from '@nangohq/utils';

import { providerTemplatesToApi } from '../../../formatters/provider.js';

import type { RetrievedProvider } from '../../../services/provider.service.js';
import type { GetProviderOutput } from './schema.js';

export function providerToMcp({ name, provider, templates }: RetrievedProvider): GetProviderOutput {
    const formattedTemplates = templates === undefined ? undefined : providerTemplatesToApi(templates);

    return {
        ...provider,
        name,
        logo_url: `${basePublicUrl}/images/template-logos/${name}.svg`,
        ...(formattedTemplates !== undefined ? { templates: formattedTemplates } : {})
    };
}
