FROM node:22.18.0-alpine

WORKDIR /app

COPY package.json .nvmrc ./
COPY index.html server.mjs ./
COPY src ./src
COPY test ./test

# The test suite is dependency-free and runs during image construction.
RUN npm test

EXPOSE 4173
CMD ["npm", "run", "serve:node"]
