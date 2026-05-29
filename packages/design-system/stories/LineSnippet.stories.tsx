import { LineSnippet } from '@/components-v2/ui/LineSnippet';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof LineSnippet> = {
    component: LineSnippet,
    title: 'Components v2/LineSnippet',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: { snippet: 'nango.auth("github", "user-123")' }
};
