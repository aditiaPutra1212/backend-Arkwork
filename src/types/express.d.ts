// file: backend/src/types/express.d.ts

// 1. Ambil tipe 'User' asli dari Passport
import { User as PassportUser } from 'passport';

// 2. Buat tipe 'User' baru kita, pastikan ada 'id'
interface MyUser {
  id: string;
  email?: string;
  // Tambahkan properti lain yang Anda miliki di 'user'
}

// 3. Gabungkan (merge) tipe kita ke dalam Express
declare global {
  namespace Express {
    // Gabungkan tipe kita dengan 'User' bawaan Passport
    export interface User extends PassportUser, MyUser {}

    // Beritahu 'Request' untuk menggunakan 'User' kustom kita
    export interface Request {
      user?: User;
    }
  }
}

// Baris ini diperlukan untuk menjadikannya modul
export {};