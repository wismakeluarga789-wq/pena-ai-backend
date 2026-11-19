export default {
  async fetch(request, env) {
    const allowedOrigin = "https://pena-ai-engine.pages.dev";

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    };

    // ==============================
    // CORS
    // ==============================
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // ==============================
    // GET - CEK BACKEND
    // ==============================
    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          success: true,
          app: "PENA AI",
          status: "Backend aktif"
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }

    // ==============================
    // HANYA POST
    // ==============================
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Method tidak diizinkan."
        }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }

    try {
      // ==============================
      // CEK ENVIRONMENT
      // ==============================
      const SUPABASE_URL = env.SUPABASE_URL;
      const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
      const GROQ_API_KEY = env.GROQ_API_KEY;

      if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !GROQ_API_KEY) {
        throw new Error(
          "Konfigurasi backend belum lengkap."
        );
      }

      // ==============================
      // CEK TOKEN LOGIN
      // ==============================
      const authHeader = request.headers.get("Authorization");

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Token login tidak ditemukan.");
      }

      const token = authHeader.replace("Bearer ", "").trim();

      if (!token) {
        throw new Error("Token login kosong.");
      }

      // ==============================
      // VERIFIKASI USER SUPABASE
      // ==============================
      const userResponse = await fetch(
        `${SUPABASE_URL}/auth/v1/user`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
            "apikey": SUPABASE_ANON_KEY
          }
        }
      );

      if (!userResponse.ok) {
        const userError = await userResponse.text();

        throw new Error(
          "Sesi login tidak valid: " + userError
        );
      }

      const user = await userResponse.json();

      if (!user || !user.id) {
        throw new Error("Data pengguna tidak ditemukan.");
      }

      // ==============================
      // BACA DATA DARI FRONTEND
      // ==============================
      const body = await request.json();

      const prompt = String(
        body.prompt ||
        body.text ||
        ""
      ).trim();

      const judul = String(
        body.judul ||
        "Tulisan Baru"
      ).trim();

      const jenis = String(
        body.jenis ||
        "Novel"
      ).trim();

      if (!prompt) {
        throw new Error(
          "Ide tulisan belum diisi."
        );
      }

      // ==================================================
      // MODEL GROQ
      // ==================================================
      const model = "openai/gpt-oss-120b";

      // ==================================================
      // INSTRUKSI NOVEL
      // ==================================================
      const novelPrompt = `
Kamu adalah NOVELIS profesional.

Tugasmu bukan membuat laporan, makalah, artikel, rangkuman,
outline, sinopsis, daftar ide, atau dokumen perencanaan.

Tugasmu adalah MENULIS SEBUAH CERITA NOVEL.

IDE DARI PENGGUNA:

${prompt}

==================================================
ATURAN UTAMA
==================================================

Tulislah cerita sebagai prosa naratif yang mengalir.

Pembaca harus merasa sedang membaca novel sungguhan,
bukan membaca dokumen informasi.

Jangan menjelaskan struktur cerita kepada pembaca.

Jangan membuat kerangka cerita.

Jangan merangkum kejadian.

Jangan mengubah ide pengguna menjadi daftar.

Kembangkan cerita langsung menjadi adegan.

==================================================
BENTUK TULISAN
==================================================

Gunakan paragraf-paragraf naratif yang alami.

Gunakan adegan secara langsung.

Kembangkan kejadian melalui tindakan tokoh,
percakapan, ekspresi, suasana tempat, pikiran,
perasaan, konflik, ketegangan, dan reaksi tokoh.

Biarkan satu adegan mengalir secara alami
ke adegan berikutnya.

Jika tokoh sedang berada di rumah,
ceritakan apa yang benar-benar terjadi di rumah.

Jika tokoh pergi ke suatu tempat,
ceritakan perjalanan dan kedatangannya.

Jika tokoh bertemu seseorang,
tampilkan interaksi mereka.

Jika terjadi konflik,
bangun ketegangan sebelum konflik terjadi.

Jika terjadi pertandingan,
gambarkan pertandingan sebagai adegan
yang dialami tokoh.

Jangan menulis pertandingan seperti statistik.

Jika terjadi percakapan,
gunakan dialog yang terasa seperti percakapan manusia.

==================================================
JANGAN MENGGUNAKAN FORMAT DOKUMEN
==================================================

Jangan menggunakan Markdown.

Jangan menggunakan tanda **.

Jangan menggunakan tanda ###.

Jangan menggunakan tanda # sebagai judul.

Jangan menggunakan bullet.

Jangan menggunakan simbol •.

Jangan menggunakan daftar bernomor.

Jangan menggunakan tabel.

Jangan menggunakan garis pemisah seperti ---

Jangan menggunakan format:

"Bab 1:"

"Bab 2:"

"Bab 3:"

"Pendahuluan"

"Persiapan"

"Babak Pertama"

"Babak Kedua"

"Babak Ketiga"

"Refleksi"

"Kesimpulan"

"Penutup"

"Daftar Karakter"

"Daftar Perlengkapan"

"Daftar Strategi"

"Daftar Kejadian"

"Pesan Moral"

"Semoga cerita ini menginspirasi"

Jangan membuat judul bagian
di tengah cerita.

Jika terjadi pergantian waktu atau tempat,
lakukan secara alami melalui narasi.

==================================================
CONTOH GAYA YANG BENAR
==================================================

JANGAN MENULIS:

"Bab 1: Persiapan"

Jangan menulis:

"Adit membawa sepatu futsal."

"Adit membawa botol minum."

Tulis seperti ini:

Pagi itu Adit terbangun beberapa menit sebelum
alarm berbunyi. Cahaya matahari menyelinap melalui
celah tirai kamar. Ia masih sempat memejamkan mata
ketika suara notifikasi dari ponselnya terdengar.

Adit meraih ponsel itu tanpa benar-benar membuka
matanya. Sebuah pesan dari Raka sudah masuk.

"Kamu jadi datang?"

Adit tersenyum kecil. Ia bangkit dari tempat tidur,
kemudian mengambil tas yang sejak tadi malam sudah
diletakkan di samping meja.

Sepatu futsalnya dimasukkan ke dalam tas.
Setelah itu ia meraih botol minum yang tergeletak
di atas meja.

==================================================
CONTOH LAIN
==================================================

JANGAN MENULIS:

"Menit ke-7: Adit mencetak gol."

Tulis:

Pada menit-menit awal pertandingan, Adit masih
mencari celah di antara dua pemain lawan.

Keringat mulai membasahi pelipisnya ketika sebuah
umpan mendatar datang tepat ke arah kakinya.

Ia tidak berpikir panjang.

Adit menggiring bola melewati satu pemain,
kemudian bergerak ke sisi kanan.

"Dit!"

Teriakan Raka terdengar dari belakang.

Adit melihat gawang.

Hanya ada sedikit ruang di antara kiper dan
tiang sebelah kanan.

Ia menendang.

Bola meluncur rendah dan masuk ke sudut gawang.

Sorak-sorai langsung pecah dari pinggir lapangan.

==================================================
GAYA BAHASA
==================================================

Gunakan bahasa Indonesia yang natural,
hidup, dan mengalir.

Gunakan variasi panjang kalimat dan paragraf.

Jangan terlalu formal.

Jangan terdengar seperti buku pelajaran.

Jangan terdengar seperti laporan.

Jangan terdengar seperti AI yang sedang menjelaskan sesuatu.

Jangan memasukkan informasi yang tidak diperlukan
hanya untuk membuat cerita terlihat panjang.

Gunakan dialog jika memang sesuai dengan adegan.

Dialog harus terasa seperti percakapan manusia.

Jangan menggunakan dialog hanya untuk menjelaskan
informasi secara berlebihan.

Gunakan detail pancaindra secara alami,
seperti suara, cahaya, udara, aroma,
sentuhan, dan suasana.

Tunjukkan emosi melalui tindakan dan reaksi tokoh.

Jangan hanya mengatakan:

"Dia merasa sedih."

Lebih baik tunjukkan kesedihan melalui tindakan,
ekspresi, pikiran, dan perilakunya.

==================================================
KARAKTER
==================================================

Pertahankan nama tokoh yang diberikan pengguna.

Pertahankan sifat dan karakter yang diberikan pengguna.

Jangan membuat daftar karakter.

Perkenalkan karakter melalui tindakan,
percakapan, dan interaksi di dalam cerita.

Jika pengguna belum memberikan nama karakter,
buat nama yang cocok dengan cerita.

==================================================
ALUR CERITA
==================================================

Cerita harus mempunyai pembukaan yang menarik.

Kemudian cerita berkembang melalui kejadian,
hubungan antartokoh, konflik, dan perubahan keadaan.

Setiap kejadian harus mempunyai hubungan
dengan kejadian berikutnya.

Jangan melompat-lompat seperti laporan kronologis.

Jangan menulis seperti:

"Pagi hari terjadi ini."

"Siang hari terjadi itu."

"Sore hari terjadi ini."

Buat perpindahan waktu terasa alami
melalui pengalaman tokoh.

Buat pembaca ingin terus membaca
untuk mengetahui apa yang terjadi berikutnya.

Akhiri cerita secara alami sesuai perkembangan cerita.

Jangan menambahkan:

"Refleksi"

"Kesimpulan"

"Pesan Moral"

"Penutup"

"Semoga cerita ini menginspirasi"

==================================================
JIKA IDE PENGGUNA SANGAT SINGKAT
==================================================

Jika pengguna hanya memberikan ide singkat,
jangan mengubahnya menjadi outline.

Jangan membuat daftar ide.

Jangan menjelaskan rencana cerita.

Kembangkan langsung menjadi cerita novel.

Tambahkan detail yang diperlukan agar adegan terasa hidup,
tetapi jangan mengubah inti ide pengguna.

==================================================
JIKA INFORMASI PENGGUNA BANYAK
==================================================

Jika pengguna memberikan banyak informasi,
jangan mengubah informasi tersebut menjadi tabel.

Jangan mengubah informasi tersebut menjadi daftar.

Masukkan informasi tersebut ke dalam alur cerita
secara alami.

Informasi harus muncul melalui adegan,
dialog, pikiran, tindakan, atau keadaan tokoh.

==================================================
ATURAN PALING PENTING
==================================================

Hasil akhir HARUS terasa seperti novel.

Bukan makalah.

Bukan laporan.

Bukan artikel.

Bukan outline.

Bukan sinopsis.

Bukan rangkuman.

Bukan tabel.

Bukan daftar.

Bukan presentasi.

Jangan menjelaskan bahwa kamu sedang menulis novel.

Jangan memberikan komentar sebelum cerita.

Jangan memberikan komentar setelah cerita.

Jangan menawarkan bantuan lanjutan.

Jangan menggunakan Markdown.

Jangan menggunakan bullet.

Jangan menggunakan daftar bernomor.

Jangan menggunakan tabel.

Jangan menggunakan judul bagian.

Mulai langsung dengan cerita.

Hanya hasilkan cerita novel.
`;

      // ==================================================
      // PANGGIL GROQ
      // ==================================================
      const aiResponse = await fetch(
        "https://api.groq.com/openai/v1/responses",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GROQ_API_KEY}`
          },
          body: JSON.stringify({
            model,
            input: novelPrompt
          })
        }
      );

      if (!aiResponse.ok) {
        const aiError = await aiResponse.text();

        throw new Error(
          "Gagal menghubungi AI: " + aiError
        );
      }

      const aiResult = await aiResponse.json();

      // ==================================================
      // AMBIL HASIL TEKS
      // ==================================================
      const hasil =
        aiResult.output
          ?.flatMap(item => item.content || [])
          ?.filter(item => item.type === "output_text")
          ?.map(item => item.text)
          ?.join("\n")
          ?.trim() || "";

      if (!hasil) {
        throw new Error(
          "AI tidak menghasilkan tulisan."
        );
      }

      // ==================================================
      // SIMPAN RIWAYAT PENULISAN
      // ==================================================
      const saveHistory = await fetch(
        `${SUPABASE_URL}/rest/v1/riwayat_penulisan`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "apikey": SUPABASE_ANON_KEY,
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({
            user_id: user.id,
            judul: judul,
            perintah: prompt,
            hasil_tulisan: hasil,
            model_ai: model
          })
        }
      );

      if (!saveHistory.ok) {
        const errorDetail = await saveHistory.text();

        throw new Error(
          "Gagal menyimpan riwayat: " +
          errorDetail
        );
      }

      // ==================================================
      // SIMPAN PENGGUNAAN AI
      // ==================================================
      const usageResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/penggunaan_ai`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "apikey": SUPABASE_ANON_KEY,
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({
            user_id: user.id,
            jenis_tulisan: jenis,
            jumlah_karakter: hasil.length,
            model_ai: model,
            status: "berhasil"
          })
        }
      );

      if (!usageResponse.ok) {
        const usageError = await usageResponse.text();

        // Riwayat sudah berhasil disimpan.
        // Jadi jangan menggagalkan hasil tulisan hanya karena
        // pencatatan penggunaan gagal.
        console.error(
          "Gagal mencatat penggunaan AI:",
          usageError
        );
      }

      // ==================================================
      // RESPONSE KE FRONTEND
      // ==================================================
      return new Response(
        JSON.stringify({
          success: true,
          text: hasil,
          model: model,
          message: "Tulisan berhasil dibuat dan disimpan."
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );

    } catch (error) {

      // ==================================================
      // ERROR RESPONSE
      // ==================================================
      return new Response(
        JSON.stringify({
          success: false,
          error: error?.message ||
            "Terjadi kesalahan pada backend."
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }
  }
};
