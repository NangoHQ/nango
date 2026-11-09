import { ArrowRight, CircleCheck, Zap } from 'lucide-react';

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@nangohq/design-system';

import { AlertButtonLink } from '@/components/ui/AlertButtonLink';
import { pluralize } from '../catalog.utils';

export type ProviderCalloutState =
    | { kind: 'configured'; count: number }
    | { kind: 'instant-managed' }
    | { kind: 'instant-api-key' }
    | { kind: 'instant-mcp' }
    | { kind: 'instant-other' }
    | { kind: 'none' };

interface ProviderCalloutProps {
    state: ProviderCalloutState;
    displayName: string;
    provider: string;
    env: string;
    setupButton: React.ReactNode;
}

export const ProviderCallout: React.FC<ProviderCalloutProps> = ({ state, displayName, provider, env, setupButton }) => {
    if (state.kind === 'none') {
        return null;
    }

    if (state.kind === 'configured') {
        return (
            <Alert variant="neutral" size="wide" icon="success" role="note">
                <CircleCheck />
                <AlertTitle>
                    {pluralize(state.count, `${displayName} integration`)} set up in {env}
                </AlertTitle>
                <AlertDescription>Manage them from Integrations, or set up another one, e.g. with different scopes.</AlertDescription>
                <AlertActions>
                    <AlertButtonLink to={`/${env}/integrations?provider=${encodeURIComponent(provider)}`}>
                        View in Integrations <ArrowRight />
                    </AlertButtonLink>
                </AlertActions>
            </Alert>
        );
    }

    return (
        <Alert variant="neutral" size="wide" cta="button" role="note">
            <Zap data-filled />
            <AlertTitle>Instant setup</AlertTitle>
            <AlertDescription>{INSTANT_SETUP_COPY[state.kind](displayName)}</AlertDescription>
            <AlertActions>{setupButton}</AlertActions>
        </Alert>
    );
};

const INSTANT_SETUP_COPY: Record<'instant-managed' | 'instant-api-key' | 'instant-mcp' | 'instant-other', (displayName: string) => string> = {
    'instant-managed': (displayName) => `Use Nango's OAuth app and skip ${displayName}'s developer app review. You can switch to your own app any time.`,
    'instant-api-key': () => 'Your users will add their own API key when they connect. Nango provides a step-by-step guide for them.',
    'instant-mcp': (displayName) => `Your users will sign in to ${displayName.replace(/ \(MCP\)$/, '')} when they connect. No developer app needed.`,
    'instant-other': () => 'Your users will add their own credentials when they connect. Nango provides a step-by-step guide for them.'
};
