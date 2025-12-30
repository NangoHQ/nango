import * as z from 'zod';

/**
 * json-rules-engine "value" types can be many things.
 * Keep it permissive, but still structured.
 */
const JsonValue: z.ZodType = z.lazy(() => z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValue), z.object({}).catchall(JsonValue)]));

/**
 * Leaf / atomic condition:
 * e.g. { fact: "plan", operator: "equal", value: "pro" }
 */
const ConditionLeaf = z.object({
    fact: z.string().min(1),
    operator: z.string().min(1), // allow custom operators
    value: JsonValue.optional(), // some operators don't need value
    path: z.string().optional(), // jsonpath into fact
    params: z.object({}).catchall(JsonValue).optional() // used by some operators / facts
});

/**
 * Composite conditions:
 * - all: [ ... ]
 * - any: [ ... ]
 * - not: { ... }
 *
 * json-rules-engine allows nesting arbitrarily.
 */
type ConditionNode = z.infer<typeof ConditionLeaf> | { all: ConditionNode[] } | { any: ConditionNode[] } | { not: ConditionNode };

const ConditionNode: z.ZodType<ConditionNode> = z.lazy(() =>
    z.union([
        ConditionLeaf,
        z.object({ all: z.array(ConditionNode).min(1) }),
        z.object({ any: z.array(ConditionNode).min(1) }),
        z.object({ not: ConditionNode })
    ])
);

/**
 * Top-level `conditions` in a rule MUST be one of:
 * { all: [...] } or { any: [...] }
 * (you can still nest not/all/any inside)
 */
const RuleConditions = z.union([z.object({ all: z.array(ConditionNode).min(1) }), z.object({ any: z.array(ConditionNode).min(1) })]);

/**
 * Rule event: what fires when rule matches.
 */
const RuleEvent = z.object({
    type: z.string().min(1),
    params: z.object({}).catchall(JsonValue).optional()
});

/**
 * Full rule definition.
 *
 * Note: json-rules-engine has other optional fields (e.g. onSuccess/onFailure),
 * but these are the core ones you’ll persist.
 */
export const JsonRulesEngineRuleSchema = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    priority: z.number().int().optional(),
    conditions: RuleConditions,
    event: RuleEvent
});
