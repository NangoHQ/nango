import type { AgentSession } from '@nangohq/types';

/**
 * Sent once in the initialize result. Only what the session was created with goes in, so it says
 * nothing about a tool the session does not have.
 */
export function buildSessionInstructions(session: AgentSession): string {
    const { nangoToolSearch, nangoExecute, nangoProxy, nangoCreateConnection } = session.metaTools;

    const sections = [
        `# Nango agent session
- This MCP server is a Nango agent session. It acts on the user's apps through the integrations below, each on one connection to that app.
- The session's integrations and tools were fixed when it was created and cannot change. You cannot add an integration or a tool from here.
- Tool names start with their integration, such as \`github__list_repos\`. Always use a name exactly as your tool list or a tool result gives it, never build one yourself.
- Your tool list may hold only some of the session's tools, so a tool missing from the list can still exist.
- You do not need to ask the user before calling a tool. Whoever runs you decides what needs their approval.`
    ];

    if (nangoToolSearch) {
        sections.push(`## Finding a tool
- When no listed tool fits the task, use nango_tool_search to find one.
- Search with a few keywords naming the action and what it acts on, such as "list calendar events", not a full sentence.
- Leave the app's name out of the query, because every tool of that app matches it.
- If a search finds nothing that fits, try again with other words for the action or the object, such as "create" instead of "add", before deciding no tool covers the task.
- Matches usually come with their input schema. When a match's input.kind is unavailable, the input has to be guessed, so if the call fails, read the error and adjust the input.
- Related results are weaker leads: when one of them fits, search again with its exact tool name to get its input.
- If you already have a tool's input schema from earlier in this conversation, reuse it instead of searching again.`);
    }

    if (nangoExecute) {
        sections.push(`## Running a tool
- Call a tool through nango_execute with its name exactly as listed${nangoToolSearch ? ' or as nango_tool_search returned it' : ''}, and its input.
- nango_execute also runs tools that are not in your tool list, and tools whose input is not an object.
- Ask tools for no more results than the task needs, and page through results rather than requesting everything at once.`);
    } else {
        sections.push(`## Running a tool
- Call a tool directly by its name${nangoToolSearch ? ', whether it is in your tool list or nango_tool_search returned it' : ''}.
- Ask tools for no more results than the task needs, and page through results rather than requesting everything at once.`);
    }

    if (nangoProxy) {
        sections.push(`## Calling an API directly
- nango_proxy calls the app's API directly on a connected integration, and Nango authenticates the request for you. Unlike the session's tools, it is not limited to what the session was set up to do, so it is a last resort: use it only when no tool covers the task${nangoToolSearch ? ', after searching' : ''}.
- Use it to fill a gap in the session's tools, not to get around them. Do not use it for something a tool refused or limited, and be careful with writes on an integration whose tools only read. When a write through nango_proxy goes beyond what the session's tools suggest it was set up for, check with the user first.`);
    }

    if (nangoCreateConnection.enabled) {
        sections.push(`## Connecting an integration
- A tool of an integration that is not connected fails. Call nango_create_connection for that integration instead of giving up.
- It returns a link only the user can open to authorise the app. Share the link, say in one sentence what they are connecting, and wait for them before trying again.
- Once connected, the integration's tools work for the rest of the session.`);
    } else {
        sections.push(`## Connecting an integration
- This session cannot connect an integration. If the task needs one that is not connected, tell the user they need to connect it, and carry on with what you can do.`);
    }

    sections.push(`## Answering
- Report what the tools returned and do not invent data. If a call fails or nothing works, say so.`);

    sections.push(`## Integrations in this session\n${describeIntegrations(session)}`);

    return sections.join('\n\n');
}

function describeIntegrations(session: AgentSession): string {
    const integrations = Object.entries(session.compiledToolset).sort(([a], [b]) => a.localeCompare(b));
    if (integrations.length === 0) {
        return 'This session has no integrations, so it cannot act on any app.';
    }

    return [
        'By the integration id every tool expects:',
        ...integrations.map(([id, { provider }]) => `- ${id} (${provider}): ${Object.hasOwn(session.resolvedConnections, id) ? 'connected' : 'not connected'}`)
    ].join('\n');
}
