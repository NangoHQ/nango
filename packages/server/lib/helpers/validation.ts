import { z } from 'zod';

export const providerSchema = z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(255);
export const providerConfigKeySchema = z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(255);
export const scriptNameSchema = z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(255);
