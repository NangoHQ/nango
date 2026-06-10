import { EditableInput } from '@/components/patterns/EditableInput';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof EditableInput> = {
    component: EditableInput,
    title: 'Components/Patterns/EditableInput',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="w-80">
            <EditableInput initialValue="my-github-connection" onSave={async () => {}} />
        </div>
    )
};
