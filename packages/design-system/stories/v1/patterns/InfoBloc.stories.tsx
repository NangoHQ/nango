import { InfoBloc } from '@/components/patterns/InfoBloc';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/Patterns/InfoBloc',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md flex flex-col gap-6 w-72">
            <InfoBloc title="Status">Active</InfoBloc>
            <InfoBloc title="Integration" help="The integration this connection belongs to.">GitHub</InfoBloc>
            <InfoBloc title="Last synced">2 minutes ago</InfoBloc>
        </div>
    )
};
