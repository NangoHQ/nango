import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/InputOTP';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'App Components/UI/InputOTP',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

function Slots() {
    return (
        <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
            ))}
        </InputOTPGroup>
    );
}

export const Default: Story = {
    render: () => (
        <InputOTP maxLength={6} aria-label="One-time password">
            <Slots />
        </InputOTP>
    )
};

export const Filled: Story = {
    render: () => (
        <InputOTP maxLength={6} defaultValue="123456" aria-label="One-time password">
            <Slots />
        </InputOTP>
    )
};

export const Disabled: Story = {
    render: () => (
        <InputOTP maxLength={6} defaultValue="123" disabled aria-label="One-time password">
            <Slots />
        </InputOTP>
    )
};
