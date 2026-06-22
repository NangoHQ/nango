import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components/Patterns/IntegrationLogo',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const PROVIDERS = ['github', 'slack', 'hubspot', 'salesforce', 'notion', 'unknown-fallback', 'unauthenticated'];

export const Default: Story = {
    render: () => (
        <div className="flex items-center gap-4 flex-wrap">
            {PROVIDERS.map((provider) => (
                <div key={provider} className="flex flex-col items-center gap-2">
                    <IntegrationLogo provider={provider} />
                    <span className="story-section-heading">{provider === 'unknown-fallback' ? 'unknown' : provider}</span>
                </div>
            ))}
        </div>
    )
};
