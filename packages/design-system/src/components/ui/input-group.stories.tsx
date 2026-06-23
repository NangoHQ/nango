import { Check, Eye, Search, X } from 'lucide-react';

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText, InputGroupTextarea } from './input-group';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Design System/Components/InputGroup',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

// InputGroup's distinguishing feature is its addons — plain field states (default/filled/disabled/invalid)
// are covered by the Input and Textarea stories, so they're not duplicated here.
export const Addons: Story = {
    render: () => (
        <div className="flex flex-col gap-4 w-72">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Inline start — icon</span>
                <InputGroup>
                    <InputGroupAddon>
                        <Search />
                    </InputGroupAddon>
                    <InputGroupInput placeholder="Search integrations…" />
                </InputGroup>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Inline end — icon</span>
                <InputGroup>
                    <InputGroupInput placeholder="0" type="number" />
                    <InputGroupAddon align="inline-end">
                        <Check />
                    </InputGroupAddon>
                </InputGroup>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Inline end — text</span>
                <InputGroup>
                    <InputGroupInput placeholder="0" type="number" />
                    <InputGroupAddon align="inline-end">
                        <InputGroupText>minutes</InputGroupText>
                    </InputGroupAddon>
                </InputGroup>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Inline end — button</span>
                <InputGroup>
                    <InputGroupInput type="password" defaultValue="super-secret-value" />
                    <InputGroupAddon align="inline-end">
                        <InputGroupButton label="Reveal value">
                            <Eye />
                        </InputGroupButton>
                    </InputGroupAddon>
                </InputGroup>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Block start</span>
                <InputGroup>
                    <InputGroupAddon align="block-start">
                        <InputGroupText className="flex-1">Header</InputGroupText>
                        <InputGroupButton label="Clear">
                            <X />
                        </InputGroupButton>
                    </InputGroupAddon>
                    <InputGroupInput placeholder="Body…" />
                </InputGroup>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Block end — textarea</span>
                <InputGroup>
                    <InputGroupTextarea placeholder="Write a message…" rows={3} />
                    <InputGroupAddon align="block-end">
                        <InputGroupText>0 / 280</InputGroupText>
                    </InputGroupAddon>
                </InputGroup>
            </div>
        </div>
    )
};
