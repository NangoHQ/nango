import { OAuthConsentView } from '@/pages/OAuth/Consent';
import { FigmaConsentView } from './oauth-consent/FigmaConsentView';

import type { PageState } from '@/pages/OAuth/Consent';
import type { OAuthConsentInteraction } from '@nangohq/types';
import type { Meta, StoryObj } from '@storybook/react-vite';

const interaction: OAuthConsentInteraction = {
    client: { name: 'Nango Management CLI', hostname: 'claude.ai' },
    redirectUri: 'http://127.0.0.1:52862/callback',
    account: { name: "Nango's Team" },
    resource: { hostname: 'mcp.nango.dev', scopes: ['environment:*'] }
};

const noop = () => {};

type Design = 'shipped' | 'figma';

interface ConsentArgs {
    design: Design;
    state: PageState;
}

function Consent({ design, state }: ConsentArgs) {
    const View = design === 'figma' ? FigmaConsentView : OAuthConsentView;
    return <View state={state} onRetry={noop} onDecide={noop} />;
}

const meta: Meta<ConsentArgs> = {
    title: 'Features/OAuth/ConsentScreen',
    render: (args) => <Consent {...args} />,
    parameters: { layout: 'fullscreen' },
    argTypes: {
        design: {
            name: 'Design',
            control: 'inline-radio',
            options: ['shipped', 'figma'],
            description: 'shipped = the screen as it renders today. figma = restyled to match Figma node 1762-347.'
        }
    },
    args: { design: 'shipped', state: { kind: 'ready', interaction } }
};
export default meta;

type Story = StoryObj<ConsentArgs>;

const story = (state: PageState): Story => ({ args: { state } });

export const Ready = story({ kind: 'ready', interaction });
export const Approving = story({ kind: 'submitting', interaction, decision: 'approve' });
export const Denying = story({ kind: 'submitting', interaction, decision: 'deny' });
export const DecisionFailed = story({ kind: 'error', interaction });
export const Loading = story({ kind: 'loading' });
export const Expired = story({ kind: 'expired' });
export const Completed = story({ kind: 'completed' });
export const Invalid = story({ kind: 'invalid' });
export const Unavailable = story({ kind: 'unavailable' });
export const LoadFailed = story({ kind: 'error' });

export const SideBySide: Story = {
    name: 'Side by side (shipped vs Figma)',
    argTypes: { design: { table: { disable: true } } },
    render: ({ state }) => (
        <div className="grid grid-cols-2 items-start divide-x divide-border-default">
            <figure className="m-0">
                <figcaption className="type-label-sm bg-surface-raised text-text-secondary px-4 py-2">Shipped</figcaption>
                <OAuthConsentView state={state} onRetry={noop} onDecide={noop} />
            </figure>
            <figure className="m-0">
                <figcaption className="type-label-sm bg-surface-raised text-text-secondary px-4 py-2">Figma 1762-347</figcaption>
                <FigmaConsentView state={state} onRetry={noop} onDecide={noop} />
            </figure>
        </div>
    )
};
