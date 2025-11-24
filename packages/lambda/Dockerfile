FROM public.ecr.aws/lambda/nodejs:24-preview.2025.11.11.00 AS builder
WORKDIR /usr/app
COPY package.json tsconfig.build.json ./
COPY lib/index.ts ./lib/index.ts
RUN npm ci
RUN npm run ts-build
RUN npm prune --production
    
FROM public.ecr.aws/lambda/nodejs:24-preview.2025.11.11.00
WORKDIR ${LAMBDA_TASK_ROOT}
COPY --from=builder /usr/app/package.json ./package.json
COPY --from=builder /usr/app/node_modules ./node_modules
COPY --from=builder /usr/app/dist ./
CMD ["lib/index.handler"]