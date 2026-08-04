import { z } from 'zod';

import { billing } from '@nangohq/billing';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { PutBillingInvoicingDetails } from '@nangohq/types';

const addressSchema = z
    .object({
        line1: z.string().nullable(),
        line2: z.string().nullable(),
        city: z.string().nullable(),
        state: z.string().nullable(),
        postalCode: z.string().nullable(),
        country: z.string()
    })
    .strict();

const taxIdSchema = z
    .object({
        country: z.string(),
        type: z.string(),
        value: z.string()
    })
    .strict();

const validation = z
    .object({
        legalEntityName: z.string(),
        email: z.email(),
        // Optional + defaulted so callers on the prior single-email payload shape (e.g. a
        // stale webapp bundle mid-deploy) keep working instead of getting invalid_body.
        // Capped at 49 to match Orb's 50-address limit (primary + additional).
        additionalEmails: z.array(z.email()).max(49).optional().default([]),
        address: addressSchema.nullable(),
        taxId: taxIdSchema.nullable()
    })
    .strict()
    .refine(
        (data) => {
            const all = [data.email, ...data.additionalEmails].map((e) => e.toLowerCase());
            return new Set(all).size === all.length;
        },
        { message: 'Duplicate billing email address', path: ['additionalEmails'] }
    );

export const putInvoicingDetails = asyncWrapper<PutBillingInvoicingDetails>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const { account, plan } = res.locals;

    if (!plan?.orb_customer_id) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'team is not linked to orb' } });
        return;
    }

    const result = await billing.putCustomer(account.id, val.data);

    if (result.isErr()) {
        report(result.error);

        if (result.error instanceof z.ZodError) {
            res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(result.error) } });
        } else {
            res.status(500).send({ error: { code: 'server_error' } });
        }

        return;
    }

    res.status(200).send({ data: result.value });
});
