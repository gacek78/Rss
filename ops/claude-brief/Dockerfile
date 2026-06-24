FROM node:20

RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY poller.mjs brief-prompt.txt ./

# Logowanie Claude Code trzymane w zamontowanym wolumenie (/data), by przetrwało restart
ENV CLAUDE_CONFIG_DIR=/data/.claude

CMD ["node", "poller.mjs"]
