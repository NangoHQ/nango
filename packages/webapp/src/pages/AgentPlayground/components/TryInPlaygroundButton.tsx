import { Bot } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@nangohq/design-system';

import { useCanUseAgentPlayground } from '@/hooks/useCanUseAgentPlayground';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import { hasStarterPrompt, integrationPrompt, playgroundDraftState } from '../draft';

import type { AnalyticsEventProperties } from '@nangohq/types';

interface TryInPlaygroundButtonProps {
    provider: string;
    integrationName: string;
    source: AnalyticsEventProperties<'playground:try_button_click'>['source'];
    variant: 'primary' | 'outline';
    size?: 'sm' | 'md';
}

export const TryInPlaygroundButton: React.FC<TryInPlaygroundButtonProps> = ({ provider, integrationName, source, variant, size = 'md' }) => {
    const env = useStore((state) => state.env);
    const canUseAgentPlayground = useCanUseAgentPlayground();
    if (!canUseAgentPlayground) {
        return null;
    }

    return (
        <Button asChild variant={variant} size={size}>
            <Link
                to={`/${env}/playground/agent`}
                state={playgroundDraftState(integrationPrompt({ provider, integrationName }), env)}
                onClick={() => track('playground:try_button_click', { provider, source, has_starter_prompt: hasStarterPrompt(provider) })}
            >
                <Bot />
                Try in Playground
            </Link>
        </Button>
    );
};
