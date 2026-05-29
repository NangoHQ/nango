import { SecretInput } from '@/components-v2/patterns/SecretInput';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof SecretInput> = {
    component: SecretInput,
    title: 'Components v2/Patterns/SecretInput',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => <SecretInput defaultValue="super-secret-token-abc123" copy className="w-72" />
};
