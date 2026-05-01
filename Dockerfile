FROM node:20-alpine

WORKDIR /app

# 1. Зөвхөн lock файлыг эхэлж хуулж суулгах нь кэш ашиглахад тустай
COPY package.json yarn.lock ./

# 2. Dependency-уудаа суулгах (Yarn ашиглан)
RUN yarn install --frozen-lockfile

# 3. Prisma схемийг хуулж, Client-ийг үүсгэх (ЭНЭ ХЭСЭГТ АЛДАА ГАРААД БАЙГАА)
COPY prisma ./prisma/
RUN yarn prisma generate

# 4. Бүх кодоо хуулах
COPY . .

# 5. NestJS build хийх
RUN yarn build

EXPOSE 3000

# 6. Build хийсэн кодоо ажиллуулах (Node-оор шууд ажиллуулах нь тогтвортой байдаг)
CMD ["yarn", "start:prod"]