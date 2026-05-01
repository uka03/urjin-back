FROM node:20-alpine

WORKDIR /app

COPY package.json yarn.lock ./

# 1. Dependency-уудаа суулгах
RUN yarn install

# 2. Prisma-ийн схемийг хуулж, Client-ийг үүсгэх (ЭНЭ ХЭСЭГ МАШ ЧУХАЛ)
COPY prisma ./prisma/
RUN npx prisma generate

# 3. Бусад бүх кодоо хуулах
COPY . .

# 4. TypeScript-ийг build хийх (NestJS ашиглаж байгаа тул)
RUN yarn build

EXPOSE 3000

# 5. Build хийсэн кодоо ажиллуулах
CMD ["node", "dist/main"]