"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyJob = applyJob;
exports.listApplications = listApplications;
exports.cancelApplication = cancelApplication;
const prisma_1 = require("../lib/prisma");
async function applyJob(userId, jobId) {
    // FUNGSI INI SUDAH BENAR
    return prisma_1.prisma.jobApplication.create({
        data: { jobId, applicantId: userId },
    });
}
async function listApplications(userId) {
    const applications = await prisma_1.prisma.jobApplication.findMany({
        where: { applicantId: userId },
        orderBy: { createdAt: "desc" },
        // Mengganti 'include' dengan 'select' untuk kontrol penuh
        select: {
            jobId: true,
            status: true,
            createdAt: true,
            job: {
                select: {
                    title: true,
                    location: true,
                },
            },
        },
    });
    return applications.map((app) => ({
        jobId: app.jobId,
        status: app.status,
        createdAt: app.createdAt,
        title: app.job.title,
        location: app.job.location,
    }));
}
async function cancelApplication(userId, id) {
    const app = await prisma_1.prisma.jobApplication.findUnique({ where: { id } });
    if (!app || app.applicantId !== userId)
        return null;
    return prisma_1.prisma.jobApplication.delete({ where: { id } });
}
