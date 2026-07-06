import posthog from 'posthog-js';

export type PlaygroundOpenSource = 'header' | 'connection' | 'integration' | 'function';

type AnalyticsProperties = Record<string, string | number | boolean>;

function track(event: string, properties?: AnalyticsProperties) {
    posthog?.capture(event, properties);
}

export function trackPlaygroundOpened(source: PlaygroundOpenSource) {
    track('web:playground:opened', { source });
}

export function trackPlaygroundRunClicked(properties: { function_type: string; integration: string; is_run_again: boolean }) {
    track('web:playground:run:clicked', properties);
}

export function trackPlaygroundRunCompleted(properties: { function_type: string; integration: string; success: boolean; state: string; duration_ms: number }) {
    track('web:playground:run:completed', properties);
}

export function trackPlaygroundRunCancelled(properties: { function_type: string; integration: string }) {
    track('web:playground:run:cancelled', properties);
}
