# Uses the full node image (not -slim) because better-sqlite3 needs to
# compile a native module on install, and the slim image lacks build tools.
FROM node:20

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV PORT=4000
ENV DB_PATH=/app/data/tickets.db
VOLUME ["/app/data"]
EXPOSE 4000

CMD ["npm", "start"]
