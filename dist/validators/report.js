"use strict";
// src/validators/report.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateReportStatusSchema = exports.createReportSchema = void 0;
const zod_1 = require("zod");
// Impor enum asli dari Prisma client
const client_1 = require("@prisma/client");
/**
 * Validator untuk MEMBUAT laporan.
 */
exports.createReportSchema = zod_1.z.object({
    // WAJIB: ID dari pekerjaan yang dilaporkan
    jobId: zod_1.z.string().uuid("ID Pekerjaan harus valid"),
    // WAJIB: Alasan laporan, harus salah satu nilai dari enum ReportReason
    reason: zod_1.z.nativeEnum(client_1.ReportReason, {
        // PERBAIKAN: 'errorMap' diubah menjadi 'message'
        message: "Alasan laporan tidak valid"
    }),
    // OPSIONAL: 'catatan' dari kode lama Anda sekarang dipetakan ke 'details'
    details: zod_1.z.string().optional().nullable(),
    // OPSIONAL: Ini ada di model Anda, jadi sebaiknya divalidasi
    reporterEmail: zod_1.z.string().email("Email pelapor tidak valid").optional().nullable(),
    evidenceUrl: zod_1.z.string().url("URL bukti tidak valid").optional().nullable()
});
/**
 * Validator untuk MENGUBAH status laporan.
 */
exports.updateReportStatusSchema = zod_1.z.object({
    status: zod_1.z.nativeEnum(client_1.ReportStatus, {
        // PERBAIKAN: 'errorMap' diubah menjadi 'message'
        message: "Nilai status tidak valid"
    })
});
