FROM node:20-alpine

WORKDIR /app

# optional (хэрвээ bcrypt гэх мэт native dependency ашиглавал хэрэг болно)
# RUN apk add --no-cache libc6-compat

COPY package.json yarn.lock ./
RUN yarn install
RUN apk add --no-cache ca-certificates
COPY . .

EXPOSE 3000
