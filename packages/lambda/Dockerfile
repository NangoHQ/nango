FROM public.ecr.aws/lambda/nodejs:24-preview.2025.11.11.00 AS builder
WORKDIR /usr/app

COPY packages/lambda/package.json ./packages/lambda/package.json
COPY packages/runner/package.json ./packages/runner/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/node-client/package.json ./packages/node-client/package.json
COPY packages/runner-sdk/package.json ./packages/runner-sdk/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/providers/package.json ./packages/providers/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/utils/package.json ./packages/utils/package.json
COPY packages/kvstore/package.json ./packages/kvstore/package.json
COPY packages/logs/package.json ./packages/logs/package.json
COPY packages/nango-yaml/package.json ./packages/nango-yaml/package.json
COPY packages/records/package.json ./packages/records/package.json
COPY packages/orchestrator/package.json ./packages/orchestrator/package.json
COPY packages/scheduler/package.json ./packages/scheduler/package.json

# Copy source code before installing so file: dependencies can be properly linked
WORKDIR /usr/app
COPY tsconfig.json ./tsconfig.json
COPY packages/lambda/ ./packages/lambda/
COPY packages/runner/ ./packages/runner/
COPY packages/database/ ./packages/database/
COPY packages/node-client/ ./packages/node-client/
COPY packages/runner-sdk/ ./packages/runner-sdk/
COPY packages/shared/ ./packages/shared/
COPY packages/providers/ ./packages/providers/
COPY packages/types/ ./packages/types/
COPY packages/utils/ ./packages/utils/
COPY packages/kvstore/ ./packages/kvstore/
COPY packages/logs/ ./packages/logs/
COPY packages/nango-yaml/ ./packages/nango-yaml/
COPY packages/records/ ./packages/records/
COPY packages/orchestrator/ ./packages/orchestrator/
COPY packages/scheduler/ ./packages/scheduler/

# Now install dependencies (file: links will work properly with source code present)
WORKDIR /usr/app/packages/lambda
RUN npm install

# Build lambda
RUN npm run ts-build

RUN npm prune --production
    
FROM public.ecr.aws/lambda/nodejs:24-preview.2025.11.11.00
WORKDIR ${LAMBDA_TASK_ROOT}
COPY --from=builder /usr/app/packages/lambda/package.json ./package.json
COPY --from=builder /usr/app/packages/lambda/node_modules ./node_modules
COPY --from=builder /usr/app/packages/lambda/dist ./
CMD ["lib/index.handler"]