# Panduan Bot WhatsApp → API

Gunakan format pesan bertanda `;` supaya mudah diparse dan langsung cocok dengan endpoint `/api/transactions/external`.

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

Catatan tambahan:

- Endpoint otomatis membuat tabel `whatsapp_poll_state` untuk menyimpan `last_message_id` per chat sehingga tidak terjadi duplikasi.
- Bisa mem-filter chat tertentu dengan query `?chat=62812@s.whatsapp.net`. Parameter ini bisa diulang untuk lebih dari satu chat.
- Error parsing/transaksi akan dicatat dalam response agar mudah diinspeksi tanpa mengulang pesan yang sama.
