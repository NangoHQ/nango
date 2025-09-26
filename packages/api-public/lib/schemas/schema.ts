import z from 'zod';

export const apiSchemaRegistry = z.registry<{ id: string }>();
