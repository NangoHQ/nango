import { Button } from '@/components-v2/ui/Button';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/UI/Button',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ['primary', 'secondary', 'tertiary', 'destructive', 'ghost'] as const;

export const Default: Story = {
    render: () => (
        <div className="flex flex-col gap-6">
            {VARIANTS.map((variant) => (
                <div key={variant} className="flex items-center gap-4 flex-wrap">
                    <span className="story-section-heading w-24 shrink-0">{variant}</span>
                    <Button variant={variant}>Connect</Button>
                    <Button variant={variant} disabled>
                        Disabled
                    </Button>
                    <Button variant={variant} loading>
                        Loading
                    </Button>
                    <Button variant={variant} size="lg">
                        Large
                    </Button>
                </div>
            ))}
        </div>
    )
};
