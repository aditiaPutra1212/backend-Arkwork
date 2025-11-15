"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const generative_ai_1 = require("@google/generative-ai");
const router = (0, express_1.Router)();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-1.5-flash";
if (!GEMINI_API_KEY) {
    console.warn("[ArkWork Agent] GEMINI_API_KEY belum di-set.");
}
const genAI = new generative_ai_1.GoogleGenerativeAI(GEMINI_API_KEY || "");
function toGeminiHistory(messages) {
    return messages
        .filter((m) => { var _a; return (_a = m.content) === null || _a === void 0 ? void 0 : _a.trim(); })
        .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
    }));
}
function buildSystemPrompt(intent, profile) {
    const base = `
Kamu adalah **ArkWork Agent**, asisten situs ArkWork.
Jawablah dalam **Bahasa Indonesia** yang jelas, ringkas, profesional.
Fokus: migas (oil & gas), LNG, utilities, serta **karier & rekrutmen**.

**Aturan umum (WAJIB):**
- Jawab dalam **Markdown** terstruktur (heading, bullet/numbered list, tabel bila cocok).
- Jika jawaban panjang, **mulai dengan TL;DR** (1–2 kalimat).
- Beri **langkah praktis** (step-by-step), checklist, contoh konkret.
- Jangan mengarang angka/fakta real-time; sebutkan asumsi bila perlu.
- Untuk karier/konsultasi: jelaskan **alasan**, **alternatif**, dan **risiko** singkat.
- Hindari klaim medis/keuangan/hukum spesifik; beri disclaimer ringan & sarankan ahli bila perlu.
- Saat menyebut sumber, **tanpa link palsu**; cukup nama sumber/keyword yang bisa dicari.

**Profil pengguna (opsional):**
${profile ? JSON.stringify(profile, null, 2) : "(tidak ada profil)"}  
`;
    const modes = {
        news: `
Mode: **Berita**
- Ringkas padat + poin penting + konteks singkat.
- Boleh sarankan keyword pencarian di O&G Monitor.
`,
        jobs: `
Mode: **Rekomendasi Kerja (Jobseeker)**
- Beri: role target, alasan cocok, skill gap, sertifikasi opsional, contoh keyword lowongan, rencana 30/60/90 hari (list).
- Jika profil minim, tanyakan 1–2 klarifikasi singkat.
`,
        consult: `
Mode: **Konsultasi**
- Struktur: *Masalah → Opsi & trade-off → Rencana aksi (bullet) → Risiko → Next steps (3–5 butir)*.
`,
        employer: `
Mode: **Employer (Perusahaan)**
- Bantu kebutuhan rekrutmen end-to-end:
  - **Job Description** (template siap salin: ringkasan, tanggung jawab, kualifikasi, nice-to-have, benefit).
  - **Screening criteria & scorecard** (w/ bobot sederhana), **pertanyaan interview** (teknis & behavioral).
  - **Rencana proses** (SLA, tahap, stakeholder), **email templates** (invitation, rejection, offer).
  - **Posting tips** (judul yang marketable, kata kunci, kanal distribusi).
  - **Kepatuhan & etika** (hindari diskriminasi, privasi kandidat).
- Jika info kurang (lokasi, seniority, range gaji, tipe kontrak): ajukan **1–2 klarifikasi singkat**.
- Outputkan bagian-bagian dalam sub-heading dan checklist agar mudah dipakai.
`,
    };
    const mode = modes[intent] || modes.news;
    return base + "\n" + mode + "\nBalas dalam **Markdown**, ringkas, to the point, dan mudah dieksekusi.";
}
/** Heuristik ringan untuk auto-deteksi intent bila tidak dikirim oleh client */
function inferIntent(text, fallback) {
    const q = (text || "").toLowerCase();
    // employer keywords
    const employerKws = [
        "employer", "perusahaan", "rekrut", "rekrutmen", "hr", "talent", "kandidat",
        "lowongan", "post job", "posting job", "job posting",
        "jd", "job description", "deskripsi pekerjaan",
        "screening", "scorecard", "wawancara", "interview",
        "template email", "offer", "rejection", "kontrak", "salary", "gaji", "benefit",
        "pipeline", "ats", "lamaran", "pelamar", "shortlist"
    ];
    if (employerKws.some(k => q.includes(k)))
        return "employer";
    // jobs (jobseeker) keywords
    const jobsKws = [
        "lamar", "apply", "cv", "resume", "portofolio", "skill",
        "sertifikasi", "career", "karier", "rekomendasi role",
        "fresh graduate", "magang", "intern", "interview tips"
    ];
    if (jobsKws.some(k => q.includes(k)))
        return "jobs";
    // consult keywords
    const consultKws = ["konsultasi", "masalah", "roadmap", "langkah", "rencana", "strategy", "strategi"];
    if (consultKws.some(k => q.includes(k)))
        return "consult";
    // news default
    return fallback || "news";
}
router.post("/", async (req, res) => {
    var _a, _b, _c;
    try {
        const body = (_a = req.body) !== null && _a !== void 0 ? _a : {};
        const messages = ((_b = body.messages) !== null && _b !== void 0 ? _b : []);
        const user = ((_c = messages[messages.length - 1]) === null || _c === void 0 ? void 0 : _c.content) || "";
        const clientIntent = body.intent || "news";
        const intent = inferIntent(user, clientIntent);
        const profile = body.profile;
        if (!(user === null || user === void 0 ? void 0 : user.trim())) {
            return res.json({
                answer: "Halo! Saya ArkWork Agent. Saya bisa bantu **berita migas**, **rekomendasi kerja**, **konsultasi**, dan **kebutuhan employer** (JD, screening, email template, dsb). Coba: **“Bikinkan JD Production Engineer level mid di Jakarta + scorecard penilaian.”**",
            });
        }
        const system = buildSystemPrompt(intent, profile);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const chat = model.startChat({
            history: [
                { role: "user", parts: [{ text: system }] },
                { role: "model", parts: [{ text: "Siap." }] },
                ...toGeminiHistory(messages.slice(0, -1)),
            ],
        });
        const result = await chat.sendMessage(user);
        const text = result.response.text();
        return res.json({ answer: (text === null || text === void 0 ? void 0 : text.trim()) || "Maaf, saya tidak menemukan jawaban." });
    }
    catch (err) {
        console.error("[ArkWork Agent] Error:", err);
        return res.status(500).json({ answer: "Maaf, terjadi kesalahan di server." });
    }
});
exports.default = router;
