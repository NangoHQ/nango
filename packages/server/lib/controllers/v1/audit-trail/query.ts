import * as z from 'zod';

const MAX_FILTER_VALUES = 50;

// Comma-separated list (`?resources=a,b`). Safe to split on a comma because both vocabularies are
// snake_case identifiers. Unlike the enum-valued query params elsewhere the values aren't checked
// against a vocabulary — the audit one has no runtime form — so an unknown value matches nothing.
const csvParam = z
    .string()
    .transform((value) => value.split(','))
    .pipe(z.array(z.string().min(1)).max(MAX_FILTER_VALUES));

const filters = {
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    resources: csvParam.optional(),
    actions: csvParam.optional()
};

// Surface an inverted range as a 400 rather than a silently empty result.
const inOrder = {
    check: (q: { from?: string | undefined; to?: string | undefined }) => !q.from || !q.to || new Date(q.from) <= new Date(q.to),
    error: { message: '`from` must be before or equal to `to`', path: ['from'] }
};

// An action is only meaningful attached to a resource, so reject the pairless form rather than
// dropping it and returning a wider result set than the caller asked for.
const actionsNeedResources = {
    check: (q: { resources?: string[] | undefined; actions?: string[] | undefined }) => !q.actions?.length || Boolean(q.resources?.length),
    error: { message: '`actions` requires `resources`', path: ['actions'] }
};

// Account-scoped endpoints (no `env`). Not strict: any stray query param is stripped rather than 400'd, so
// a read never fails over an extra key.
export const auditListQuery = z
    .object({ cursor: z.string().optional(), ...filters })
    .refine(inOrder.check, inOrder.error)
    .refine(actionsNeedResources.check, actionsNeedResources.error);

// No `cursor`: an export walks the window itself, so accepting one would silently drop the rows before it.
export const auditExportQuery = z.object(filters).refine(inOrder.check, inOrder.error).refine(actionsNeedResources.check, actionsNeedResources.error);
