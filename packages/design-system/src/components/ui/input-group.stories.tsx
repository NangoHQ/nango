import { Check, Eye, Search, X } from 'lucide-react';

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText, InputGroupTextarea } from './input-group';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Design System/Components/InputGroup',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

// Hover and focus are interaction states — inspect them live in the canvas; they can't be forced statically.
export const States: Story = {
    render: () => (
        <div className="flex flex-col gap-4 w-72">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Default</span>
                <InputGroup>
                    <InputGroupInput placeholder="Enter API key…" />
                </InputGroup>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Filled</span>
                <InputGroup>
                    <InputGroupInput defaultValue="nango_sk_live_abc123" />
                </InputGroup>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Disabled</span>
                <InputGroup>
                    <InputGroupInput placeholder="Disabled" disabled />
                </InputGroup>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Invalid</span>
                <InputGroup>
                    <InputGroupInput defaultValue="bad value" aria-invalid />
                </InputGroup>
            </div>
        </div>
    )
};

export const Textarea: Story = {
    render: () => (
        <div className="flex flex-col gap-4 w-80">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Default</span>
                <InputGroup>
                    <InputGroupTextarea placeholder="Enter a description…" rows={3} />
                </InputGroup>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Filled</span>
                <InputGroup>
                    <InputGroupTextarea defaultValue="This sync fetches all contacts from HubSpot." rows={3} />
                </InputGroup>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Disabled</span>
                <InputGroup>
                    <InputGroupTextarea placeholder="Disabled" disabled rows={3} />
                </InputGroup>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Invalid</span>
                <InputGroup>
                    <InputGroupTextarea defaultValue="bad value" aria-invalid rows={3} />
                </InputGroup>
            </div>
        </div>
    )
};

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
                <span className="story-section-heading">Block end</span>
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
