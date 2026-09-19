FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

# Sources are bind-mounted by docker-compose; node_modules stays in the image's volume.
EXPOSE 5173
CMD ["npm", "run", "dev"]
