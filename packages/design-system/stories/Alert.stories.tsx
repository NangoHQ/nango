import { CircleCheck } from 'lucide-react';

import { Alert, AlertActions, AlertButton, AlertDescription, AlertTitle } from '@/components-v2/ui/Alert';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/Alert',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ['success', 'info', 'warning', 'error'] as const;

export const Default: Story = {
    render: () => (
        <div className="flex flex-col gap-4 max-w-2xl">
            {VARIANTS.map((variant) => (
                <Alert key={variant} variant={variant}>
                    <CircleCheck />
                    <AlertTitle className="capitalize">{variant}</AlertTitle>
                    <AlertDescription>Your integration is connected and syncing.</AlertDescription>
                    <AlertActions>
                        <AlertButton variant={`${variant}-secondary`}>View logs</AlertButton>
                    </AlertActions>
                </Alert>
            ))}
        </div>
    )
};

export const NoIcon: Story = {
    name: 'No icon',
    render: () => (
        <div className="flex flex-col gap-4 max-w-2xl">
            {VARIANTS.map((variant) => (
                <Alert key={variant} variant={variant}>
                    <AlertDescription>Token expires in 3 days — {variant}.</AlertDescription>
                </Alert>
            ))}
        </div>
    )
};
