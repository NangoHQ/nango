import { useState } from 'react';

import { ColorInput } from '@/components-v2/ui/ColorInput';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof ColorInput> = {
    component: ColorInput,
    title: 'Components v2/ColorInput',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => {
        const [value, setValue] = useState('#6366f1');
        return <ColorInput value={value} onChange={(e) => setValue(e.target.value)} className="w-48" />;
    }
};
