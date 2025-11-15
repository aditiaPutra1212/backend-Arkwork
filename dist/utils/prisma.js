"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/utils/prisma.ts
const client_1 = require("@prisma/client");
const globalForPrisma = global;
const prisma = (_a = globalForPrisma.prisma) !== null && _a !== void 0 ? _a : new client_1.PrismaClient({
    log: ['warn', 'error'],
});
// agar 1 instance di dev (hot reload)
if (process.env.NODE_ENV !== 'production')
    globalForPrisma.prisma = prisma;
exports.default = prisma;
