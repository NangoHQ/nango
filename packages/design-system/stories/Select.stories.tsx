import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components-v2/ui/Select';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/Select',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex items-end gap-6">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Default size</span>
                <Select defaultValue="hourly">
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder="Frequency" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="realtime">Real-time</SelectItem>
                        <SelectItem value="hourly">Hourly</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Small</span>
                <Select defaultValue="production">
                    <SelectTrigger size="sm" className="w-36">
                        <SelectValue placeholder="Environment" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="production">Production</SelectItem>
                        <SelectItem value="staging">Staging</SelectItem>
                        <SelectItem value="development">Development</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
};
