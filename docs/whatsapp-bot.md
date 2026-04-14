# Panduan Bot WhatsApp → API

Default koneksi WhatsApp API sekarang otomatis ke `http://10.20.25.25:3000/` dan bisa berjalan tanpa auth.
Jika server Anda butuh auth, isi env `WHATSAPP_API_USER` dan `WHATSAPP_API_PASS`.

Gunakan format pesan bertanda `;` supaya mudah diparse dan langsung cocok dengan endpoint `/api/transactions/external`.

## Mode API Only (Tanpa Webhook)

Jika tidak ingin webhook, kirim hasil parsing bot WhatsApp langsung ke endpoint berikut:

`POST https://<host-app>/api/transactions/external`

Env yang disarankan:

```env
WHATSAPP_WEBHOOK_ENABLED=false
WHATSAPP_WEBHOOK_SEND_ACK=false
```

Header wajib request:

- `Content-Type: application/json`
- `X-External-Secret: <EXTERNAL_TRANSACTION_TOKEN>`

## Mode WebSocket GOWA (Realtime Tanpa Webhook)

Mode ini membuka koneksi WS dari aplikasi ke GOWA, lalu pesan masuk diproses langsung jadi transaksi.

Env minimum:

```env
WHATSAPP_WS_URL=ws://10.20.25.25:3000/ws?device_id=a534a587-fabb-4726-a40d-bd8ef054130c
WHATSAPP_WS_CONTROL_SECRET=84d4f5c7a9eb4b0297c0d552c1d3a8cc
WHATSAPP_WS_DEFAULT_USER_ID=1
WHATSAPP_WS_SEND_ACK=false
```

Control endpoint:

- `GET /api/whatsapp/ws` → lihat status koneksi
- `POST /api/whatsapp/ws?secret=<WHATSAPP_WS_CONTROL_SECRET>` body `{"action":"start"}` → mulai koneksi
- `POST /api/whatsapp/ws?secret=<WHATSAPP_WS_CONTROL_SECRET>` body `{"action":"stop"}` → stop koneksi

Catatan:

- Koneksi WS ini berjalan di proses server Next.js. Jika server restart, panggil action `start` lagi.
- Command WA yang didukung tetap format `TIPE;Kategori;Jumlah;...` seperti parser yang sudah ada.

## Mode Realtime (Disarankan): Webhook

Untuk realtime, gunakan webhook ke endpoint aplikasi:

`POST https://<host-app>/api/whatsapp/webhook?secret=<WHATSAPP_WEBHOOK_SECRET>`

Contoh env minimum untuk mode webhook:

```env
WHATSAPP_API_BASE_URL=http://10.20.25.25:3000/
WHATSAPP_WEBHOOK_SECRET=isi-token-sendiri
WHATSAPP_WEBHOOK_DEFAULT_USER_ID=1
WHATSAPP_WEBHOOK_SEND_ACK=true
```

Catatan:

- `WHATSAPP_WEBHOOK_ALLOWED_SENDERS` bisa dikosongkan untuk menerima semua pengirim.
- Jika ingin batasi nomor tertentu, isi dengan format JID dipisah koma.

## 1. Registrasi Email (sekali)

```
EMAIL trimateri@gmail.com
```

Simpan email tersebut di storage bot dan pakai untuk semua request berikutnya.

## 2. Format Pesan Transaksi

```
<TIPE>;<KATEGORI>;<JUMLAH>[;<TANGGAL>][;sumber=<NAMA_AKUN>|account=<ID_AKUN>][;<DESKRIPSI>]
```

- `TIPE`: `PENGELUARAN|KELUAR|EXPENSE` atau `PEMASUKAN|MASUK|INCOME`
- `KATEGORI`: bebas (mis. `Makan`, `Transport`)
- `JUMLAH`: angka, boleh ada koma/titik pemisah
- `TANGGAL` (opsional): `YYYY-MM-DD`; kosong ⇒ pakai hari ini
- `sumber=` (opsional): nama akun persis seperti di aplikasi (mis. `Cash`, `ATM BCA`). Alternatif `account=` atau `acc=` untuk ID numerik.
- Sisa teks ⇒ deskripsi

Contoh:
```
PENGELUARAN;Makan;50000;2025-12-27;sumber=Cash;Bakso malam
```

## 3. Payload HTTP yang dikirim bot

```jsonc
{
  "email": "trimateri@gmail.com",      // dari langkah registrasi
  "type": "expense",                  // hasil interpretasi token pertama
  "category": "Makan",
  "amount": 50000,
  "date": "2025-12-27",              // atau hilangkan saja
  "source": "Cash",                  // atau "accountId": 6
  "description": "Bakso malam"
}
```

Header wajib:

```
Content-Type: application/json
X-External-Secret: <EXTERNAL_TRANSACTION_TOKEN>
```

Endpoint: `POST https://<host-app-anda>/api/transactions/external`.

## 4. Balasan ke user WhatsApp

Gunakan response API:

```json
{"message":"Transaksi berhasil","data":{...}}
```

Format ulang memakai template notifikasi yang sama seperti `formatTransactionMessage()` untuk konsistensi:

```
Catatan Pengeluaran
Kategori : Makan
Jumlah   : Rp 50.000
Tanggal  : 27 Desember 2025
Sumber   : Cash
Catatan  : Bakso malam
```

## 5. Pseudo-code Parser Bot

```ts
const mapType = (token: string) => {
  const lower = token.toLowerCase()
  if (["pengeluaran", "keluar", "expense"].includes(lower)) return "expense"
  if (["pemasukan", "masuk", "income"].includes(lower)) return "income"
  throw new Error("Tipe tidak dikenal")
}

function parseMessage(text: string) {
  const parts = text.split(";").map((p) => p.trim()).filter(Boolean)
  const [rawType, category, rawAmount, ...rest] = parts
  if (!rawType || !category || !rawAmount) throw new Error("Format minimal TIPE;Kategori;Jumlah")

  const amount = Number(rawAmount.replace(/[^0-9]/g, ""))
  if (!amount) throw new Error("Jumlah tidak valid")

  let date: string | undefined
  let source: string | undefined
  let accountId: number | undefined
  const descriptionParts: string[] = []

  for (const segment of rest) {
    if (!date && /^\d{4}-\d{2}-\d{2}$/.test(segment)) {
      date = segment
      continue
    }
    if (/^(acc|account)=/i.test(segment)) {
      accountId = Number(segment.split("=")[1])
      continue
    }
    if (/^(src|source|sumber)=/i.test(segment)) {
      source = segment.split("=")[1]?.trim()
      continue
    }
    descriptionParts.push(segment)
  }

  return {
    type: mapType(rawType),
    category,
    amount,
    date,
    accountId,
    source,
    description: descriptionParts.join("; ") || undefined,
  }
}
```

Gabungkan hasil `parseMessage()` dengan email yang tersimpan, lalu kirim ke API.

## 6. Endpoint Poller Internal

Sebagai alternatif webhook, aplikasi kini expose `POST /api/whatsapp/poller` yang bisa dijalankan lewat cron job atau scheduler (mis. `curl` tiap 2 menit). Route ini akan:

- Mengambil daftar chat dari konfigurasi internal.
- Memanggil endpoint `GET /chat/{jid}/messages` milik WhatsApp API menggunakan Basic Auth dan header `X-Device-Id` yang sama seperti pengiriman pesan.
- Memproses pesan masuk (`is_from_me=false`) dengan parser yang sama (`parseTransactionCommand`).
- Mencatat transaksi langsung via `createTransaction()` + kirim notifikasi WhatsApp ketika sukses.

### Konfigurasi yang dibutuhkan

| Variabel | Fungsi |
| --- | --- |
| `WHATSAPP_POLL_SECRET` | Token yang wajib dikirim lewat header `X-Poll-Secret` (atau query `?secret=`) saat memanggil endpoint. |
| `WHATSAPP_POLL_TARGETS` | Daftar chat dalam format `jid=userId[:accountId]`, pisahkan dengan koma. Contoh: `62812@s.whatsapp.net=4:7,62895@s.whatsapp.net=5`. Jika tidak diisi, service akan jatuh ke `WHATSAPP_WEBHOOK_SENDER_MAP`. |
| `WHATSAPP_POLL_LIMIT` | (Opsional) Batas pesan per chat sekali fetch. Default `25`, maksimum `100`. |
| `WHATSAPP_POLL_LOOKBACK_MINUTES` | (Opsional) Saat belum punya offset, poller hanya melihat pesan dalam rentang menit ini ke belakang. Default `120`. |
| `WHATSAPP_POLL_SEND_ACK` | Set `true` bila ingin mengirim balasan sukses ke chat sumber. |

### Konfigurasi minimum (tanpa auth)

```env
WHATSAPP_API_BASE_URL=http://10.20.25.25:3000/
WHATSAPP_POLL_SECRET=isi-token-sendiri
WHATSAPP_POLL_TARGETS=62812xxxx@s.whatsapp.net=1:1
```

Pemanggilan poller:

```bash
curl -X POST "https://<host-app>/api/whatsapp/poller" \\
  -H "X-Poll-Secret: isi-token-sendiri"
```

### Konfigurasi webhook (opsional)

Jika go-whatsapp Anda bisa kirim webhook event incoming message, arahkan ke:

`POST https://<host-app>/api/whatsapp/webhook`

Route ini bisa langsung membuat transaksi pemasukan/pengeluaran dari format pesan di atas.

Catatan tambahan:

- Endpoint otomatis membuat tabel `whatsapp_poll_state` untuk menyimpan `last_message_id` per chat sehingga tidak terjadi duplikasi.
- Bisa mem-filter chat tertentu dengan query `?chat=62812@s.whatsapp.net`. Parameter ini bisa diulang untuk lebih dari satu chat.
- Error parsing/transaksi akan dicatat dalam response agar mudah diinspeksi tanpa mengulang pesan yang sama.
