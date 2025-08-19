// src/index.ts
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import http from 'node:http';

// Routers (existing)
import authRouter from './routes/auth';
import newsRouter from './routes/news';
import chatRouter from './routes/chat';
import adminRouter from './routes/admin';
import { employerRouter } from './routes/employer';

// Monetization & Payments
import adminPlansRouter from './routes/admin-plans';
import paymentsRouter from './routes/payments';

const app = express();
const NODE_ENV = process.env.NODE_ENV || 'development';
const DEFAULT_PORT = Number(process.env.PORT || 4000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

if (NODE_ENV === 'production') {
  // agar Express membaca IP asli di belakang proxy (Heroku/Render/Nginx)
  app.set('trust proxy', 1);
}

/** ---------------- CORS ---------------- */
const origins = FRONTEND_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    // izinkan non-browser (curl, server2server/webhook) yang biasanya tanpa Origin
    if (!origin) return cb(null, true);
    if (origins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

/** --------------- Middlewares --------------- */
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});
app.use(cookieParser());
// Midtrans webhook juga JSON → cukup json() (tidak perlu raw body)
app.use(express.json({ limit: '2mb' }));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/** --------------- Static --------------- */
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

/** --------------- Health --------------- */
app.get('/', (_req, res) => res.send('OK'));
app.get('/health', (_req, res) => res.json({ ok: true }));

/** --------------- Routes --------------- */
app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/api/news', newsRouter);
app.use('/api/chat', chatRouter);

// Employer 5-step signup
app.use('/api/employers', employerRouter);

// Admin Monetization (plans CRUD)
app.use('/admin/plans', adminPlansRouter);

// Payments / Midtrans (checkout & webhook)
app.use('/api/payments', paymentsRouter);

/** --------------- 404 (paling akhir) --------------- */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

/** --------------- Error handler --------------- */
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  if (err instanceof Error && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS: Origin not allowed' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

/** --------------- Listen (auto-retry port) --------------- */
function startServer(startPort: number, maxTries = 10) {
  let port = startPort;
  let tries = 0;
  const server = http.createServer(app);

  function tryListen() {
    server.listen(port);
  }

  server.on('listening', () => {
    console.log('========================================');
    console.log(`🚀 Backend listening on http://localhost:${port}`);
    console.log(`NODE_ENV           : ${NODE_ENV}`);
    console.log(`FRONTEND_ORIGIN(s) : ${origins.join(', ') || '(none)'}`);
    console.log('========================================');
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE' && tries < maxTries) {
      console.warn(`Port ${port} in use, trying ${port + 1}...`);
      tries += 1;
      port += 1;
      setTimeout(tryListen, 200);
    } else {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
  });

  // graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.close(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    server.close(() => process.exit(0));
  });

  tryListen();
}

startServer(DEFAULT_PORT);
