import { track } from '@/utils/analytics';

import type { AnalyticsEvents } from '@/utils/analyticsEvents';

export type PlaygroundOpenSource = AnalyticsEvents['playground:playground_view']['source'];

export function trackPlaygroundOpened(source: PlaygroundOpenSource) {
    track('playground:playground_view', { source });
}

export function trackPlaygroundRunClicked(properties: AnalyticsEvents['playground:run_start']) {
    track('playground:run_start', properties);
}

export function trackPlaygroundRunCompleted(properties: AnalyticsEvents['playground:run_complete']) {
    track('playground:run_complete', properties);
}

export function trackPlaygroundRunCancelled(properties: AnalyticsEvents['playground:run_cancel']) {
    track('playground:run_cancel', properties);
}
