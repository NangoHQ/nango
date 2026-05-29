import { SimpleCodeBlock } from '@/components-v2/ui/SimpleCodeBlock';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof SimpleCodeBlock> = {
    component: SimpleCodeBlock,
    title: 'Components v2/SimpleCodeBlock',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        language: 'typescript',
        children: `const connection = await nango.getConnection('github', 'user-123');`
    }
};
