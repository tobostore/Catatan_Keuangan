export interface SaranBudgetKategori {
  kategori: string
  pengeluaran_sekarang: number
  batas_saran: number
  status: "aman" | "berlebih" | "kritis"
  saran: string
}

export interface AlokasiIdealItem {
  name: string
  percentage: number
  amount: number
}

export interface BudgetAnalysis {
  status_keuangan: "sehat" | "perhatian" | "kritis"
  persentase_pengeluaran: number
  pesan_utama: string
  saran_budget: SaranBudgetKategori[]
  alokasi_ideal: {
    kebutuhan_pokok: number
    keinginan: number
    tabungan: number
  }
  alokasi_ideal_items?: AlokasiIdealItem[]
  target_tabungan_bulan_ini: number
  estimasi_tabungan_aktual: number
  tips_bulan_ini: string[]
}

export interface AIAlert {
  id: number
  tipe: string
  level: "warning" | "danger"
  judul: string
  pesan: string
  aksi: string
  is_read: boolean
  expired_at: string
  created_at: string
}

export interface MonthlySummary {
  skor_keuangan: number
  grade: "A" | "B" | "C" | "D"
  ringkasan: string
  pencapaian: string[]
  perlu_diperbaiki: string[]
  target_bulan_depan: string[]
  kategori_boros: string
  saran_kategori_boros: string
}

export interface AutoKategoriResult {
  kategori: string
  tipe: "pemasukan" | "pengeluaran"
  confidence: "high" | "medium" | "low"
}
