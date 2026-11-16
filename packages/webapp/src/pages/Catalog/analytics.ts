import { track } from '@/utils/analytics';

import type { AnalyticsEventProperties } from '@nangohq/types';

export type CatalogFilter = AnalyticsEventProperties<'catalog:filter_update'>['filter'];
export type SetupButtonSource = AnalyticsEventProperties<'catalog:setup_button_click'>['source'];

export function trackCatalogCardClick(properties: AnalyticsEventProperties<'catalog:provider_link_click'>) {
    track('catalog:provider_link_click', properties);
}

export function trackSetupButtonClick(provider: string, source: SetupButtonSource) {
    track('catalog:setup_button_click', { provider, source });
}

export function trackCatalogFilter(filter: CatalogFilter, resultCount: number) {
    track('catalog:filter_update', { filter, result_count: resultCount });
}
