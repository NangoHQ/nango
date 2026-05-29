import { SideInfo, SideInfoRow } from '@/components-v2/ui/SideInfo';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof SideInfo> = {
    component: SideInfo,
    title: 'Components v2/SideInfo',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <SideInfo>
            <SideInfoRow label="Status">Active</SideInfoRow>
            <SideInfoRow label="Integration">GitHub</SideInfoRow>
            <SideInfoRow label="Last synced">2 minutes ago</SideInfoRow>
        </SideInfo>
    )
};
