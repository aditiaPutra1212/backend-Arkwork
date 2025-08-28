"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
// backend/src/utils/prisma.ts
const client_1 = require("@prisma/client");
exports.prisma = new client_1.PrismaClient();
process.on('beforeExit', async () => {
    await exports.prisma.$disconnect();
});
