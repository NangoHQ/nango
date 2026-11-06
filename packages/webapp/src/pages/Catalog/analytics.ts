import { track } from '@/utils/analytics';

import type { AnalyticsEventProperties } from '@nangohq/types';

export type CatalogFilter = AnalyticsEventProperties<'integrations:filter_update'>['filter'];
export type SetupButtonSource = AnalyticsEventProperties<'integrations:setup_button_click'>['source'];

export function trackCatalogCardClick(properties: AnalyticsEventProperties<'integrations:catalog_link_click'>) {
    track('integrations:catalog_link_click', properties);
}

export function trackSetupButtonClick(provider: string, source: SetupButtonSource) {
    track('integrations:setup_button_click', { provider, source });
}

export function trackCatalogFilter(filter: CatalogFilter, resultCount: number) {
    track('integrations:filter_update', { filter, result_count: resultCount, page: 'catalog' });
}
