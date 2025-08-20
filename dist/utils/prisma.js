"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
// src/utils/prisma.ts
const client_1 = require("@prisma/client");
exports.prisma = global._prisma ?? new client_1.PrismaClient();
if (process.env.NODE_ENV !== "production") {
    global._prisma = exports.prisma;
}
