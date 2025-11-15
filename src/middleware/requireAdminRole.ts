// backend/src/middleware/requireAdminRole.ts
import { Request, Response, NextFunction } from 'express';

export function requireAdminRole(req: Request, res: Response, next: NextFunction) {
  // Middleware ini harus dijalankan SETELAH requireAuthJwt
  if (req.admin?.role === 'admin') {
    next(); // User adalah admin, lanjutkan
  } else {
    res.status(403).json({ message: 'Forbidden: Admin access required' }); // User login tapi bukan admin
  }
}