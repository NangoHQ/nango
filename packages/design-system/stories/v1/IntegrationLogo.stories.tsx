import { IntegrationLogo } from '@/components/ui/IntegrationLogo';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/UI/IntegrationLogo',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const PROVIDERS = ['github', 'slack', 'hubspot', 'salesforce', 'notion', 'unknown-provider', 'unauthenticated'];

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md flex items-center gap-6">
            {PROVIDERS.map((provider) => (
                <div key={provider} className="flex flex-col items-center gap-2">
                    <IntegrationLogo provider={provider} height={8} width={8} />
                    <span className="story-section-heading">{provider === 'unknown-provider' ? 'unknown' : provider}</span>
                </div>
            ))}
        </div>
    )
};
