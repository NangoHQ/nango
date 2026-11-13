import { SecretInput } from './secret-input';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof SecretInput> = {
    title: 'Design System/Components/SecretInput',
    component: SecretInput,
    parameters: { layout: 'padded' },
    args: { value: 'nango_sk_dev_7f2a9e1b3c5d8f0a2b4c6d8e0f1a34c9' }
};
export default meta;
type Story = StoryObj<typeof meta>;

// Masked by default with the last 3 characters visible. Eye reveals, EyeOff hides; copy always copies the real value.
export const Default: Story = {
    render: (args) => (
        <div className="w-96">
            <SecretInput {...args} aria-label="Secret key" />
        </div>
    )
};

export const Variants: Story = {
    render: (args) => (
        <div className="flex w-96 flex-col gap-4">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">md</span>
                <SecretInput {...args} aria-label="Secret key" />
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">sm</span>
                <SecretInput {...args} size="sm" aria-label="Secret key" />
            </div>
            <div className="flex flex-col gap-1">
                {/* Members without access: no reveal, no copy */}
                <span className="story-section-heading">canReveal=false</span>
                <SecretInput {...args} canReveal={false} aria-label="Secret key" />
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Disabled</span>
                <SecretInput {...args} disabled aria-label="Secret key" />
            </div>
        </div>
    )
};
