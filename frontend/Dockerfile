FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["sh", "-c", "npm run build && npm run start -- --port 8001"]
