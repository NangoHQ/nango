import { Button } from '@/components/ui/button/Button';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/UI/Button',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ['primary', 'success', 'danger', 'zombie', 'zombieGray', 'yellow', 'zinc', 'secondary', 'tertiary'] as const;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md flex flex-col gap-4">
            {VARIANTS.map((variant) => (
                <div key={variant} className="flex items-center gap-4 flex-wrap">
                    <span className="story-section-heading w-28 shrink-0">{variant}</span>
                    <Button variant={variant} size="sm">Default</Button>
                    <Button variant={variant} size="md">Medium</Button>
                    <Button variant={variant} size="sm" disabled>Disabled</Button>
                    <Button variant={variant} size="sm" isLoading>Loading</Button>
                </div>
            ))}
        </div>
    )
};
