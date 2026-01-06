<agents_system priority="1">
<usage>
Agents are specialized AI assistants that run in independent contexts for complex multi-step tasks.

How to use agents (spawned with independent context):
- The <path> from the agent entry contains the agent definition file
- The agent definition will be automatically loaded into the subagent's context
- Invoke: Task(subagent_type="<agent-name>", prompt="task description")
- The agent runs in a separate context and returns results
- Example: Task(subagent_type="code-reviewer", prompt="Review the authentication code in auth.ts")

Usage notes:
- Agents have independent context windows
- Each agent invocation is stateless
- Agents are spawned as subprocesses via the Task tool
- The agent's AGENT.md file is loaded into the subagent's context automatically
</usage>

<available_agents>

<agent>
<name>nango-docs-migrator</name>
<description>Migrates Nango integration documentation from old tabbed format to new simplified structure with separate guide pages and pre-built syncs sections</description>
<path>.claude/agents/nango-docs-migrator.md</path>
</agent>
</available_agents>
</agents_system>
