"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    const email = process.env.SEED_EMP_EMAIL || 'company.owner@example.com';
    const company = process.env.SEED_EMP_COMPANY || 'Contoh Perusahaan';
    const pw = process.env.SEED_EMP_PASSWORD || 'CompanyPass123';
    const hash = await bcryptjs_1.default.hash(pw, 10);
    // buat employer jika belum ada
    const employer = await prisma.employer.upsert({
        where: { slug: company.toLowerCase().replace(/\s+/g, '-') },
        update: {},
        create: {
            slug: company.toLowerCase().replace(/\s+/g, '-'),
            displayName: company, legalName: company
        },
        select: { id: true }
    });
    await prisma.employerAdminUser.upsert({
        where: { email },
        update: { passwordHash: hash, employerId: employer.id },
        create: { email, passwordHash: hash, employerId: employer.id, isOwner: true, fullName: 'Owner ' + company, agreedTosAt: new Date() }
    });
    console.log('Seeded employer admin:', email, 'password:', pw);
}
main().finally(() => prisma.$disconnect());
