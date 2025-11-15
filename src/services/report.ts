// src/services/report.ts

import prisma from "../utils/prisma";

// Impor validator yang sudah benar
import {
  CreateReportInput,
  UpdateReportStatusInput
} from "../validators/report";

/**
 * PERBAIKAN ERROR 2 (Bagian 1):
 * Fungsi 'mapStatusToEnum' sudah TIDAK DIPERLUKAN lagi
 * karena validator kita sekarang MEMAKSA input untuk sudah
 * sesuai dengan enum Prisma.
 *
 * FUNGSI INI DIHAPUS.
 */
// function mapStatusToEnum( ... ) { ... }

export function listReports() {
  return prisma.jobReport.findMany({ orderBy: { createdAt: "desc" } });
}

export function createReport(data: CreateReportInput) {
  // Sekarang 'data' sudah memiliki field yang benar dari validator
  return prisma.jobReport.create({
    data: {
      jobId: data.jobId,
      reason: data.reason,

      // PERBAIKAN ERROR 1:
      // 'data.catatan' diubah menjadi 'data.details'
      details: data.details ?? undefined,

      // Kita tambahkan juga field lain dari validator
      reporterEmail: data.reporterEmail ?? undefined,
      evidenceUrl: data.evidenceUrl ?? undefined
      
      // 'status' akan otomatis 'OPEN' (nilai default dari schema)
    }
  });
}

export function updateReportStatus(id: string, data: UpdateReportStatusInput) {
  return prisma.jobReport.update({
    where: { id },

    // PERBAIKAN ERROR 2 (Bagian 2):
    // Kita tidak perlu memetakan status lagi.
    // 'data.status' sudah dijamin oleh validator berisi 'OPEN', 'UNDER_REVIEW', dll.
    data: {
      status: data.status
    }
  });
}

export function deleteReport(id: string) {
  return prisma.jobReport.delete({ where: { id } });
}