import { track } from '@/utils/analytics';

import type { AnalyticsEventProperties } from '@nangohq/types';

export type PlaygroundOpenSource = AnalyticsEventProperties<'playground:playground_view'>['source'];

export function trackPlaygroundOpened(source: PlaygroundOpenSource) {
    track('playground:playground_view', { source });
}

export function trackPlaygroundRunClicked(properties: AnalyticsEventProperties<'playground:run_start'>) {
    track('playground:run_start', properties);
}

export function trackPlaygroundRunCompleted(properties: AnalyticsEventProperties<'playground:run_complete'>) {
    track('playground:run_complete', properties);
}

export function trackPlaygroundRunCancelled(properties: AnalyticsEventProperties<'playground:run_cancel'>) {
    track('playground:run_cancel', properties);
}
