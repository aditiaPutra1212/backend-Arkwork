import { prisma } from "../lib/prisma";

export async function applyJob(userId: string, jobId: string) {
  // FUNGSI INI SUDAH BENAR
  return prisma.jobApplication.create({
    data: { jobId, applicantId: userId },
  });
}


export async function listApplications(userId: string) {
  const applications = await prisma.jobApplication.findMany({
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

export async function cancelApplication(userId: string, id: string) {
  
  const app = await prisma.jobApplication.findUnique({ where: { id } });
  if (!app || app.applicantId !== userId) return null;

  return prisma.jobApplication.delete({ where: { id } });
}