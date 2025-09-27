
    FROM node:20-alpine AS build
    WORKDIR /app
    COPY package*.json ./
    RUN npm ci
    COPY prisma prisma
    RUN npx prisma generate
    COPY tsconfig.json ./
    COPY src src
    RUN npm run build
    
    FROM node:20-alpine
    WORKDIR /app
    COPY package*.json ./
    RUN npm ci --omit=dev
    
  
    COPY --from=build /app/prisma ./prisma
    COPY --from=build /app/dist ./dist
    
    
    COPY --from=build /app/node_modules/.prisma /app/node_modules/.prisma
    COPY --from=build /app/node_modules/@prisma /app/node_modules/@prisma
    
    EXPOSE 3000
    CMD ["node", "dist/main.js"]
    