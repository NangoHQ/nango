FROM daytonaio/sandbox:0.6.0

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends jq \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g nango opencode-ai \
    && npm cache clean --force

ENV NANGO_PROJECT_DIR=/home/daytona/nango-integrations

RUN mkdir -p "$NANGO_PROJECT_DIR" \
    && chown -R daytona:daytona /home/daytona

USER daytona
WORKDIR $NANGO_PROJECT_DIR

RUN nango init . --copy \
    && rm -rf github dist \
    && printf 'export {};\n' > index.ts \
    && npm install --no-audit --no-fund --no-progress
