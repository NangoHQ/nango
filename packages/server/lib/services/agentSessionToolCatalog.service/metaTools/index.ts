import { createConnectionToolDefinition } from './createConnection.js';
import { executeToolDefinition } from './execute.js';
import { proxyToolDefinition } from './proxy.js';
import { toolSearchToolDefinition } from './toolSearch.js';

import type { AgentSessionToolDefinition } from '../types.js';

export const AGENT_SESSION_META_TOOL_DEFINITIONS: AgentSessionToolDefinition[] = [
    toolSearchToolDefinition,
    executeToolDefinition,
    proxyToolDefinition,
    createConnectionToolDefinition
];
