"use strict";
// src/services/report.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listReports = listReports;
exports.createReport = createReport;
exports.updateReportStatus = updateReportStatus;
exports.deleteReport = deleteReport;
const prisma_1 = __importDefault(require("../utils/prisma"));
/**
 * PERBAIKAN ERROR 2 (Bagian 1):
 * Fungsi 'mapStatusToEnum' sudah TIDAK DIPERLUKAN lagi
 * karena validator kita sekarang MEMAKSA input untuk sudah
 * sesuai dengan enum Prisma.
 *
 * FUNGSI INI DIHAPUS.
 */
// function mapStatusToEnum( ... ) { ... }
function listReports() {
    return prisma_1.default.jobReport.findMany({ orderBy: { createdAt: "desc" } });
}
function createReport(data) {
    var _a, _b, _c;
    // Sekarang 'data' sudah memiliki field yang benar dari validator
    return prisma_1.default.jobReport.create({
        data: {
            jobId: data.jobId,
            reason: data.reason,
            // PERBAIKAN ERROR 1:
            // 'data.catatan' diubah menjadi 'data.details'
            details: (_a = data.details) !== null && _a !== void 0 ? _a : undefined,
            // Kita tambahkan juga field lain dari validator
            reporterEmail: (_b = data.reporterEmail) !== null && _b !== void 0 ? _b : undefined,
            evidenceUrl: (_c = data.evidenceUrl) !== null && _c !== void 0 ? _c : undefined
            // 'status' akan otomatis 'OPEN' (nilai default dari schema)
        }
    });
}
function updateReportStatus(id, data) {
    return prisma_1.default.jobReport.update({
        where: { id },
        // PERBAIKAN ERROR 2 (Bagian 2):
        // Kita tidak perlu memetakan status lagi.
        // 'data.status' sudah dijamin oleh validator berisi 'OPEN', 'UNDER_REVIEW', dll.
        data: {
            status: data.status
        }
    });
}
function deleteReport(id) {
    return prisma_1.default.jobReport.delete({ where: { id } });
}
