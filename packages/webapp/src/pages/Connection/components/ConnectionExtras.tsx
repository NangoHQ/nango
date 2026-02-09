import { Braces } from 'lucide-react';

import { CodeBlock } from '@/components-v2/CodeBlock';
import { ScopesInput } from '@/components-v2/ScopesInput';
import { Label } from '@/components-v2/ui/label';

import type { ConnectionConfig, Metadata } from '@nangohq/types';

const JSON_DISPLAY_LIMIT = 250_000;

export const ConnectionExtras = ({
    config,
    metadata,
    rawTokenResponse
}: {
    config: ConnectionConfig;
    metadata: Metadata | null;
    rawTokenResponse: Record<string, unknown> | null;
}) => {
    const configJson = JSON.stringify(config || {}, null, 4);
    const metadataJson = JSON.stringify(metadata || {}, null, 4);
    const rawTokenResponseJson = JSON.stringify(rawTokenResponse || {}, null, 4);
    const shouldBlurRawTokenResponse = rawTokenResponseJson !== '{}';

    return (
        <>
            {config.oauth_scopes_override && (
                <div className="flex flex-col gap-2">
                    <Label>OAuth scopes override</Label>
                    <ScopesInput scopesString={config.oauth_scopes_override.join(',')} placeholder="Scopes override" readOnly />
                </div>
            )}

            <div className="flex flex-col gap-2">
                <Label>Connection configuration</Label>
                <CodeBlock
                    language="json"
                    displayLanguage="JSON"
                    icon={<Braces />}
                    code={configJson.length < JSON_DISPLAY_LIMIT ? configJson : 'Connection config too large to display'}
                />
            </div>

            <div className="flex flex-col gap-2">
                <Label>Connection metadata</Label>
                <CodeBlock
                    language="json"
                    displayLanguage="JSON"
                    icon={<Braces />}
                    code={metadataJson.length < JSON_DISPLAY_LIMIT ? metadataJson : 'Connection metadata too large to display'}
                />
            </div>

            {rawTokenResponse !== null && (
                <div className="flex flex-col gap-2">
                    <Label>Raw token response</Label>
                    <CodeBlock
                        secret={shouldBlurRawTokenResponse}
                        language="json"
                        displayLanguage="JSON"
                        icon={<Braces />}
                        code={rawTokenResponseJson.length < JSON_DISPLAY_LIMIT ? rawTokenResponseJson : 'Raw token response too large to display'}
                    />
                </div>
            )}
        </>
    );
};
