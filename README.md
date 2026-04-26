# 🧾 Catatan Keuangan
_Aplikasi pencatatan keuangan pribadi yang rapi, cepat, dan siap scan struk._

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![MySQL](https://img.shields.io/badge/MySQL-Database-blue?logo=mysql)](https://www.mysql.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

![Screenshot](docs/screenshot.png)

## ✨ Tentang Proyek

**Catatan Keuangan** adalah aplikasi web untuk membantu pengguna mencatat, mengelola, dan memahami alur keuangan pribadi secara lebih terstruktur. Aplikasi ini dibuat dengan fokus pada pengalaman input yang cepat, tampilan modern, dan alur penggunaan yang sederhana sehingga cocok dipakai sehari-hari.

Selain pencatatan manual, proyek ini juga menyediakan fitur **OCR (Optical Character Recognition)** untuk membaca struk atau nota belanja. Dengan dukungan **Tesseract.js**, pengguna dapat memotret struk lalu mengekstrak data transaksi tanpa harus mengetik ulang seluruh detail secara manual.

Aplikasi ini dibangun sebagai fondasi personal finance dashboard yang fleksibel. Di dalamnya tersedia manajemen transaksi, kategori, akun, laporan, serta integrasi tambahan seperti autentikasi JWT dan jalur API untuk otomatisasi input data.

## 🚀 Fitur Utama

- 📌 Catat pemasukan dan pengeluaran dengan alur yang sederhana
- 🧾 Scan struk/nota menggunakan OCR untuk mempercepat input transaksi
- 📊 Lihat ringkasan dan visualisasi keuangan lewat chart interaktif
- 🗂️ Kelola kategori transaksi agar data lebih rapi
- 💳 Kelola akun atau sumber dana untuk tiap transaksi
- 🔐 Autentikasi pengguna berbasis JWT
- 📨 Dukungan API transaksi eksternal untuk otomasi input
- ⚡ UI modern dengan Tailwind CSS dan komponen Radix UI

## 🧰 Tech Stack

| Kategori | Teknologi |
| --- | --- |
| Framework | Next.js 16 (App Router) |
| Bahasa | TypeScript |
| UI | React 19, Tailwind CSS v4, Radix UI, Lucide React |
| Charts | Recharts |
| Database | MySQL via mysql2 |
| Form | React Hook Form + Zod |
| OCR | Tesseract.js (English & Indonesian) |
| Auth | jose (JWT) |
| Utility | class-variance-authority, tailwind-merge, sonner |

## 📁 Struktur Folder

| Folder | Keterangan |
| --- | --- |
| `app/` | Halaman dan route handler Next.js App Router |
| `components/` | Komponen UI reusable dan layout |
| `context/` | React Context untuk state global |
| `database/` | Koneksi dan query MySQL |
| `docs/` | Dokumentasi tambahan proyek |
| `hooks/` | Custom React hooks |
| `lib/` | Utility functions, auth helper, dan integrasi internal |
| `public/` | Aset statis |
| `scripts/` | Script database seperti `recreate-db` |
| `styles/` | Global CSS |

## ⚙️ Cara Instalasi & Setup

### 1) Clone repository

```bash
git clone https://github.com/tobostore/Catatan_Keuangan.git
cd Catatan_Keuangan
```

### 2) Install dependencies

```bash
npm install
```

### 3) Setup file environment

Buat file `.env.local` di root project, lalu isi variabel yang dibutuhkan.

```env
DB_HOST=127.0.0.1
DB_USER=Catatan_Pengeluaran
DB_PASSWORD="password_database_anda"
DB_NAME=catatan_pengeluaran
JWT_SECRET=isi_secret_jwt_yang_kuat
```

Jika password database mengandung karakter `$`, gunakan tanda kutip dan escape agar Next.js membaca nilai literalnya.

Contoh:

```env
DB_PASSWORD=
```

### 4) Setup database

Pastikan server MySQL aktif, database tersedia, dan user MySQL sudah diizinkan mengakses host aplikasi.

Jika diperlukan, buat ulang database dengan script yang disediakan:

```bash
npm run db:recreate
```

### 5) Jalankan aplikasi

```bash
npm run dev
```

## 🔐 Konfigurasi Environment Variables

| Variabel | Wajib | Keterangan |
| --- | --- | --- |
| `DB_HOST` | Ya | Host server MySQL |
| `DB_USER` | Ya | Username MySQL |
| `DB_PASSWORD` | Ya | Password MySQL |
| `DB_NAME` | Ya | Nama database yang dipakai |
| `JWT_SECRET` | Ya | Secret untuk tanda tangan token JWT |

Contoh `.env.local` yang lebih lengkap:

```env
AUTH_SECRET=isi_secret_auth_yang_kuat
AUTH_URL=http://localhost:3000
DB_HOST=127.0.0.1
DB_PORT=33310
DB_USER=Catatan_Pengeluaran
DB_PASSWORD="password_database_anda"
DB_NAME=catatan_pengeluaran
JWT_SECRET=isi_secret_jwt_yang_kuat
```

## ▶️ Cara Menjalankan

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm run start
```

Server production dijalankan di port **3100**.

## 🤝 Kontribusi

Kontribusi sangat dipersilakan. Jika ingin membantu pengembangan proyek ini, silakan:

1. Fork repository ini
2. Buat branch baru untuk perubahan Anda
3. Lakukan perubahan secara rapi dan terukur
4. Pastikan aplikasi tetap berjalan dengan baik
5. Ajukan pull request dengan deskripsi yang jelas

## 📄 Lisensi

Proyek ini dirilis di bawah **Lisensi MIT**.

---

Dikembangkan oleh **Mass Harr (tobostore)**.
