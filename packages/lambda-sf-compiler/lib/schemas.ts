import * as z from 'zod';

import type { CLIDeployFlowConfig } from '@nangohq/types';

export type SfFunctionType = 'action' | 'sync';

// Mirrors the validation regexes used in postSfDeploy / postSfRun
const integrationIdSchema = z
    .string()
    .regex(/^[a-zA-Z0-9~:.@ _-]+$/)
    .max(255);

const functionNameSchema = z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(255);

export const compileRequestSchema = z
    .object({
        integration_id: integrationIdSchema,
        function_name: functionNameSchema,
        function_type: z.enum(['action', 'sync']),
        code: z.string().min(1)
    })
    .strict();

export type CompileRequest = z.infer<typeof compileRequestSchema>;

export type CompileResponse =
    | {
          success: true;
          bundledJs: string;
          flow: CLIDeployFlowConfig;
      }
    | {
          success: false;
          step: 'validation' | 'compilation';
          message: string;
          stack?: string;
      };
