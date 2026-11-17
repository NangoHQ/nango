import type { AgentSession, AgentSessionResolvedConnection } from '@nangohq/types';

const MAX_ACCOUNT_LABEL_LENGTH = 100;

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

    sections.push(`## Stating your goal and intent
- Pass a goal with every tool you run${nangoToolSearch ? ' and every nango_tool_search' : ''}: the overall task the user asked you to do, kept as close to their own words as you can.
- Send the same goal on every call made for one task, and a new one only when the user asks for something else.
- Also pass an intent with every tool you run: how that one call helps toward the goal. It changes with every step, and is never the goal again or the tool's description.
- For example, when the user asks to "summarize my unread emails and save the summary in Notion", every call has that goal, and the intents go "list unread emails", "read the next batch of unread emails", then "create the summary page in Notion".
- Leave names, emails, IDs and other personal details out of both.`);

    if (nangoToolSearch) {
        sections.push(`## Finding a tool
- When no listed tool fits the task, use nango_tool_search to find one.
- Search with a few keywords naming the action and what it acts on, such as "list calendar events", not a full sentence.
- When the task needs several tools, search for all of them in one call, one query per tool, such as ["list calendar events", "send an email"]. Results come back grouped by query.
- Leave the app's name out of each query, because every tool of that app matches it.
- If a query finds nothing that fits, try again with other words for the action or the object, such as "create" instead of "add", before deciding no tool covers the task.
- Matches usually come with their input schema. When a match's input.kind is unavailable, the input has to be guessed, so if the call fails, read the error and adjust the input.
- Related results are weaker leads: when one of them fits, search again with its exact tool name to get its input.
- If you already have a tool's input schema from earlier in this conversation, reuse it instead of searching again.`);
    }

    const howToRun = nangoExecute
        ? `- Call a tool through nango_execute with its name exactly as listed${nangoToolSearch ? ' or as nango_tool_search returned it' : ''}, and its input.
- nango_execute also runs tools that are not in your tool list.
- When you call a tool directly by its name instead, pass its input as \`input\`, next to \`goal\` and \`intent\`.`
        : `- Call a tool directly by its name${nangoToolSearch ? ', whether it is in your tool list or nango_tool_search returned it' : ''}.
- Pass its input as \`input\`, next to \`goal\` and \`intent\`, such as {"input": {"limit": 10}, "goal": "...", "intent": "..."}. A tool that takes no input takes only \`goal\` and \`intent\`.`;

    sections.push(`## Running a tool
${howToRun}
- Ask tools for no more results than the task needs, and page through results rather than requesting everything at once.`);

    if (nangoProxy) {
        sections.push(`## Calling an API directly
- nango_proxy calls the app's API directly on a connected integration, and Nango authenticates the request for you. Unlike the session's tools, it is not limited to what the session was set up to do, so it is a last resort: use it only when no tool covers the task${nangoToolSearch ? ', after searching' : ''}.
- Use it to fill a gap in the session's tools, not to get around them. Do not use it for something a tool refused or limited, and be careful with writes on an integration whose tools only read. When a write through nango_proxy goes beyond what the session's tools suggest it was set up for, check with the user first.
- Pass the goal, and as its intent say why no tool fit and which tool would have done it.`);
    }

    if (nangoCreateConnection.enabled) {
        sections.push(`## Connecting an integration
- A tool of an integration that is not connected fails. Call nango_create_connection for that integration instead of giving up.
- It returns a link only the user can open to authorise the app. Share the link, say in one sentence what they are connecting, and wait for them before trying again.
- Once connected, the integration's tools work for the rest of the session.
- If a tool fails because the connection is missing a permission, or its credentials expired or ran out of refresh attempts, call nango_create_connection for that integration with reconnect set to true, and share that link the same way.`);
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
    const integrations = Object.entries(session.compiledToolset)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, { provider }]) => ({ id, provider, connection: connectionOf(session, id) }));
    if (integrations.length === 0) {
        return 'This session has no integrations, so it cannot act on any app.';
    }

    return [
        'By the integration id every tool expects:',
        ...integrations.map(({ id, provider, connection }) => `- ${id} (${provider}): ${describeConnection(connection)}`),
        'Each connected integration is on the account of the user this session acts for.',
        `This is each integration's status when you received these instructions. ${session.metaTools.nangoCreateConnection.enabled ? 'After you connect one, or when unsure' : 'When unsure'}, trust ${session.metaTools.nangoToolSearch ? 'nango_tool_search results and ' : ''}tool errors over this list.`
    ].join('\n');
}

function connectionOf(session: AgentSession, integrationId: string): AgentSessionResolvedConnection | undefined {
    return Object.hasOwn(session.resolvedConnections, integrationId) ? session.resolvedConnections[integrationId] : undefined;
}

function describeConnection(connection: AgentSessionResolvedConnection | undefined): string {
    if (!connection) {
        return 'not connected';
    }

    const accountLabel = connection.accountLabel ? cleanAccountLabel(connection.accountLabel) : '';
    return accountLabel ? `connected by ${JSON.stringify(accountLabel)}` : 'connected';
}

/**
 * The label is tag text the instructions quote, so it is kept to one short line that cannot start
 * a line or a section of its own.
 */
function cleanAccountLabel(label: string): string {
    return label
        .replace(/[\s\p{Cc}\p{Cf}]+/gu, ' ')
        .trim()
        .slice(0, MAX_ACCOUNT_LABEL_LENGTH)
        .trim();
}
