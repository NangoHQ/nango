import { CopyInput } from './copy-input';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof CopyInput> = {
    title: 'Design System/Components/CopyInput',
    component: CopyInput,
    parameters: { layout: 'padded' },
    args: { value: 'a0583184-a6ef-40e5-b716-2d7aeacf84b3' }
};
export default meta;
type Story = StoryObj<typeof meta>;

// Read-only + mono. Click the copy button: the icon swaps to a check and the tooltip reads "Copied" for ~1.5s.
export const Default: Story = {
    render: (args) => (
        <div className="w-96">
            <CopyInput {...args} aria-label="Environment ID" />
        </div>
    )
};

export const Variants: Story = {
    render: () => (
        <div className="flex w-96 flex-col gap-4">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Environment ID · md</span>
                <CopyInput value="a0583184-a6ef-40e5-b716-2d7aeacf84b3" aria-label="Environment ID" />
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Callback URL · sm</span>
                <CopyInput size="sm" value="https://api.nango.dev/oauth/callback" aria-label="Callback URL" />
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Disabled</span>
                <CopyInput disabled value="https://api.nango.dev/oauth/callback" aria-label="Callback URL" />
            </div>
        </div>
    )
};
