import { ErrorCircle } from '@/components/ui/ErrorCircle';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/ErrorCircle',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const ICONS = ['!', 'sync', 'auth', 'clock', 'x', 'info', 'check'] as const;
const COLORS = ['red-base', 'yellow-base', 'green-base', 'blue-base'] as const;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md flex flex-col gap-6">
            <div className="flex items-center gap-4">
                {ICONS.map((icon) => (
                    <div key={icon} className="flex flex-col items-center gap-2">
                        <ErrorCircle icon={icon} color="red-base" />
                        <span className="story-section-heading">{icon}</span>
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-4">
                {COLORS.map((color) => (
                    <div key={color} className="flex flex-col items-center gap-2">
                        <ErrorCircle icon="!" color={color} />
                        <span className="story-section-heading">{color.replace('-base', '')}</span>
                    </div>
                ))}
            </div>
        </div>
    )
};
