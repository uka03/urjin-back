FROM node:20-alpine

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Шаардлагатай бол build хийх (Жишээ нь NestJS бол)
# RUN yarn build 

RUN apk add --no-cache ca-certificates
COPY . .

EXPOSE 3000

# Апп-ыг ажиллуулах команд (package.json дахь нэртэй ижил байна)
CMD ["yarn", "start"]