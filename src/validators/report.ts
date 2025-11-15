// src/validators/report.ts

import { z } from "zod";
// Impor enum asli dari Prisma client
import { ReportReason, ReportStatus } from "@prisma/client";

/**
 * Validator untuk MEMBUAT laporan.
 */
export const createReportSchema = z.object({
  // WAJIB: ID dari pekerjaan yang dilaporkan
  jobId: z.string().uuid("ID Pekerjaan harus valid"),

  // WAJIB: Alasan laporan, harus salah satu nilai dari enum ReportReason
  reason: z.nativeEnum(ReportReason, {
    // PERBAIKAN: 'errorMap' diubah menjadi 'message'
    message: "Alasan laporan tidak valid"
  }),

  // OPSIONAL: 'catatan' dari kode lama Anda sekarang dipetakan ke 'details'
  details: z.string().optional().nullable(),

  // OPSIONAL: Ini ada di model Anda, jadi sebaiknya divalidasi
  reporterEmail: z.string().email("Email pelapor tidak valid").optional().nullable(),
  evidenceUrl: z.string().url("URL bukti tidak valid").optional().nullable()
});

/**
 * Validator untuk MENGUBAH status laporan.
 */
export const updateReportStatusSchema = z.object({
  status: z.nativeEnum(ReportStatus, {
    // PERBAIKAN: 'errorMap' diubah menjadi 'message'
    message: "Nilai status tidak valid"
  })
});

// Tipe data ini sekarang secara otomatis sesuai dengan skema baru di atas
export type CreateReportInput = z.infer<typeof createReportSchema>;
export type UpdateReportStatusInput = z.infer<typeof updateReportStatusSchema>;