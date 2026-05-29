import { Avatar } from '@/components-v2/ui/Avatar';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/Avatar',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const EXAMPLES = [
    { name: 'John Doe', label: 'Two words' },
    { name: 'Nango', label: 'Single word' },
    { name: 'Acme/Production', label: 'Slash separator' }
];

export const Default: Story = {
    render: () => (
        <div className="flex items-center gap-6">
            {EXAMPLES.map(({ name, label }) => (
                <div key={name} className="flex flex-col items-center gap-2">
                    <Avatar name={name} />
                    <span className="story-section-heading">{label}</span>
                </div>
            ))}
        </div>
    )
};
