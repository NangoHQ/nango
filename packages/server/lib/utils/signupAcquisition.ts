import * as z from 'zod';

const campaign = z
    .string()
    .trim()
    .min(1)
    .max(256)
    // oxlint-disable-next-line no-control-regex -- Reject control characters in untrusted campaign values.
    .regex(/^[^\x00-\x1f\x7f@]+$/)
    .optional();
// Analytics input is optional and never makes a valid signup fail.
export const signupAcquisitionSchema = z
    .object({
        acquisition_utm_source: campaign,
        acquisition_utm_medium: campaign,
        acquisition_utm_campaign: campaign,
        acquisition_utm_content: campaign,
        acquisition_utm_term: campaign,
        acquisition_referring_domain: z
            .string()
            .max(253)
            .regex(/^[a-z0-9.-]+$/i)
            .optional(),
        acquisition_landing_path: z
            .string()
            .max(1024)
            // oxlint-disable-next-line no-control-regex -- Only accept a path without control characters or query data.
            .regex(/^\/[^?#\x00-\x1f\x7f]*$/)
            .optional()
    })
    .strip()
    .optional()
    .catch(undefined);
