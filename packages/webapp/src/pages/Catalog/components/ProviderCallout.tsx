import { ArrowRight, CircleCheck, Plus, Zap } from 'lucide-react';

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@nangohq/design-system';

import { AlertButtonLink } from '@/components/ui/AlertButtonLink';
import { Skeleton } from '@/components/ui/Skeleton';
import { trackSetupButtonClick } from '../analytics';
import { pluralize } from '../catalog.utils';

export type ProviderCalloutState =
    | { kind: 'loading' }
    | { kind: 'configured'; integrationIds: string[] }
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
    canAddAnother: boolean;
}

export const ProviderCallout: React.FC<ProviderCalloutProps> = ({ state, displayName, provider, env, canAddAnother }) => {
    if (state.kind === 'none') {
        return null;
    }

    if (state.kind === 'loading') {
        return <Skeleton className="h-[62px] w-full" />;
    }

    const onlyIntegrationId = state.kind === 'configured' && state.integrationIds.length === 1 ? state.integrationIds[0] : undefined;
    if (state.kind === 'configured') {
        return (
            <Alert variant="success" size="wide" role="note">
                <CircleCheck />
                <AlertTitle>
                    {onlyIntegrationId ? `${displayName} integration` : pluralize(state.integrationIds.length, `${displayName} integration`)} set up in {env}
                </AlertTitle>
                <AlertDescription>
                    {onlyIntegrationId ? 'Manage it from its integration page' : 'Manage them from Integrations'}
                    {canAddAnother ? ', or add another one, e.g. with different scopes.' : '.'}
                </AlertDescription>
                <AlertActions>
                    {canAddAnother && (
                        <AlertButtonLink to={`/${env}/catalog/${provider}/add`} onClick={() => trackSetupButtonClick(provider, 'callout', 'form')}>
                            <Plus /> Add another
                        </AlertButtonLink>
                    )}
                    {onlyIntegrationId ? (
                        <AlertButtonLink to={`/${env}/integrations/${encodeURIComponent(onlyIntegrationId)}`}>
                            View integration <ArrowRight />
                        </AlertButtonLink>
                    ) : (
                        <AlertButtonLink to={`/${env}/integrations?provider=${encodeURIComponent(provider)}`}>
                            View in Integrations <ArrowRight />
                        </AlertButtonLink>
                    )}
                </AlertActions>
            </Alert>
        );
    }

    return (
        <Alert variant="neutral" size="wide" cta="button" role="note">
            <Zap data-filled />
            <AlertTitle>Instant setup</AlertTitle>
            <AlertDescription>{INSTANT_SETUP_COPY[state.kind](displayName)}</AlertDescription>
        </Alert>
    );
};

const INSTANT_SETUP_COPY: Record<'instant-managed' | 'instant-api-key' | 'instant-mcp' | 'instant-other', (displayName: string) => string> = {
    'instant-managed': (displayName) => `Use Nango's OAuth app and skip ${displayName}'s developer app review. You can switch to your own app any time.`,
    'instant-api-key': () => 'Your users will add their own API key when they connect. Nango provides a step-by-step guide for them.',
    'instant-mcp': (displayName) => `Your users will sign in to ${displayName} when they connect. No developer app needed.`,
    'instant-other': () => 'Your users will add their own credentials when they connect. Nango provides a step-by-step guide for them.'
};
