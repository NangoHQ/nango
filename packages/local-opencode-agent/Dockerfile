FROM node:24-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl git jq \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g nango opencode-ai \
    && npm cache clean --force

RUN useradd -m -s /bin/bash user \
    && mkdir -p /home/user/nango-integrations \
    && chown -R user:user /home/user

COPY --chown=user:user packages/daytona-opencode-agent/embedded-skills/nango-remote-function-builder /home/user/nango-integrations/.agents/skills/nango-remote-function-builder

USER user
WORKDIR /home/user/nango-integrations

RUN nango init . --copy \
    && rm -rf github dist \
    && printf 'export {};\n' > index.ts \
    && npm install --no-audit --no-fund --no-progress

CMD ["tail", "-f", "/dev/null"]
