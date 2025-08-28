// backend/src/utils/prisma.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
