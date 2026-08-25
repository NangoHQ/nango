FROM node:22-bookworm-slim

ARG NANGO_VERSION=0.70.6

ENV NANGO_CLI_UPGRADE_MODE=ignore
ENV NODE_ENV=production

RUN getent group user >/dev/null || groupadd user \
    && id -u user >/dev/null 2>&1 || useradd --gid user --create-home --shell /bin/bash user \
    && mkdir -p /tmp/template-support /home/user/agentcore-runtime \
    && chown -R user:user /home/user/agentcore-runtime

COPY packages/sandbox/agentcore-runtime/cleanup-nango-project.mjs /tmp/template-support/cleanup-nango-project.mjs

RUN npm install -g nango@${NANGO_VERSION} \
    && npm cache clean --force

USER user
WORKDIR /home/user

# --copy skips dependency installation and precompile work; the image provides
# the CLI and workspace dependencies from the pinned global install.
RUN nango init --copy nango-integrations
RUN node /tmp/template-support/cleanup-nango-project.mjs /home/user/nango-integrations

COPY --chown=user:user packages/sandbox/agentcore-runtime/server.mjs /home/user/agentcore-runtime/server.mjs

WORKDIR /home/user/nango-integrations
# Reuse the global CLI install instead of running a second npm install.
RUN mkdir -p node_modules \
    && ln -s /usr/local/lib/node_modules/nango node_modules/nango \
    && ln -s /usr/local/lib/node_modules/nango/node_modules/zod node_modules/zod

EXPOSE 8080

CMD ["node", "/home/user/agentcore-runtime/server.mjs"]
