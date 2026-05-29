import { MultiLanguageCodeBlock } from '@/components-v2/ui/MultiLanguageCodeBlock';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof MultiLanguageCodeBlock> = {
    component: MultiLanguageCodeBlock,
    title: 'Components v2/MultiLanguageCodeBlock',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        title: 'Get connection',
        snippets: [
            {
                language: 'typescript',
                displayLanguage: 'Node',
                icon: null,
                code: `const conn = await nango.getConnection('github', 'user-123');`
            },
            {
                language: 'python',
                displayLanguage: 'Python',
                icon: null,
                code: `conn = nango.get_connection('github', 'user-123')`
            }
        ]
    }
};
