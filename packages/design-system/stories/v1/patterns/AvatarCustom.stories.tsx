import { AvatarCustom } from '@/components/patterns/AvatarCustom';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/Patterns/AvatarCustom',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md flex items-center gap-6">
            {[
                { name: 'John Doe', label: 'Two words' },
                { name: 'Nango', label: 'Single word' },
                { name: 'Acme/Production', label: 'Slash' }
            ].map(({ name, label }) => (
                <div key={name} className="flex flex-col items-center gap-2">
                    <AvatarCustom displayName={name} />
                    <span className="story-section-heading">{label}</span>
                </div>
            ))}
        </div>
    )
};
