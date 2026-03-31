FROM node:24-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl git jq \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g nango \
    && npm cache clean --force

RUN useradd -m -s /bin/bash user \
    && mkdir -p /home/user/nango-integrations \
    && chown -R user:user /home/user

USER user
WORKDIR /home/user/nango-integrations

RUN nango init . --copy \
    && rm -rf github dist \
    && printf 'export {};\n' > index.ts \
    && npm install --no-audit --no-fund --no-progress

CMD ["tail", "-f", "/dev/null"]
