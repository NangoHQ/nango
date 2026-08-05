import { track } from '@/utils/analytics';

export type PlaygroundOpenSource = 'header' | 'connection' | 'integration' | 'function';

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
