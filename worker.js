const cors = {
  "Access-Control-Allow-Origin": "https://pena-ai-engine.pages.dev",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export default {
  async fetch(request, env) {
    const headers = {
      ...cors,
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method === "GET") {
      return Response.json({
        success: true,
        app: "PENA AI",
        status: "Backend aktif"
      }, { headers });
    }

    if (request.method !== "POST") {
      return Response.json(
        { error: "Gunakan metode POST." },
        { status: 405, headers }
      );
    }

    try {
      const url = env.SUPABASE_URL;
      const anonKey = env.SUPABASE_ANON_KEY;
      const apiKey = env.GROQ_API_KEY;
      const model = "openai/gpt-oss-120b";

      const missing = [];

      if (!url) missing.push("SUPABASE_URL");
      if (!anonKey) missing.push("SUPABASE_ANON_KEY");
      if (!apiKey) missing.push("GROQ_API_KEY");

      if (missing.length) {
        return Response.json({
          success: false,
          error: "Konfigurasi belum terbaca: " + missing.join(", ")
        }, { status: 500, headers });
      }

      const authHeader = request.headers.get("Authorization");

      if (!authHeader?.startsWith("Bearer ")) {
        return Response.json(
          { error: "Silakan login terlebih dahulu." },
          { status: 401, headers }
        );
      }

      const token = authHeader.slice(7);

      // Verifikasi akun Supabase
      const authResponse = await fetch(
        `${url}/auth/v1/user`,
        {
          headers: {
            "apikey": anonKey,
            "Authorization": `Bearer ${token}`
          }
        }
      );

      if (!authResponse.ok) {
        return Response.json(
          { error: "Sesi login tidak valid." },
          { status: 401, headers }
        );
      }

      const user = await authResponse.json();
      const body = await request.json();

      const prompt = body.prompt || body.text;

      if (!prompt || !String(prompt).trim()) {
        return Response.json(
          { error: "Perintah penulisan masih kosong." },
          { status: 400, headers }
        );
      }

      /*
       * PENA AI - INSTRUKSI PENULISAN NOVEL
       *
       * AI harus bertindak sebagai novelis, bukan pembuat makalah,
       * laporan, artikel, rangkuman, atau outline.
       */
      const novelPrompt = `
Kamu adalah penulis novel profesional.

Tugasmu adalah mengembangkan ide pengguna menjadi tulisan fiksi bergaya NOVEL yang hidup, mengalir, emosional, dan enak dibaca.

IDE / PERINTAH PENGGUNA:
${String(prompt)}

ATURAN WAJIB PENULISAN:

1. Tulis seperti novel sungguhan, bukan makalah, artikel, laporan, rangkuman, atau outline.
2. Gunakan prosa naratif yang mengalir dari awal sampai akhir.
3. Bangun adegan melalui tindakan, dialog, suasana, pikiran, perasaan, ekspresi, dan interaksi antarkarakter.
4. Gunakan paragraf naratif yang natural dengan panjang yang bervariasi.
5. Jangan membuat daftar poin.
6. Jangan menggunakan bullet.
7. Jangan menggunakan nomor 1., 2., 3., dan seterusnya sebagai struktur tulisan.
8. Jangan menggunakan tabel.
9. Jangan menggunakan format Markdown.
10. Jangan menggunakan tanda ** atau ## atau ###.
11. Jangan membuat bagian seperti "Pendahuluan", "Babak Pertama", "Babak Kedua", "Refleksi", "Kesimpulan", "Strategi", atau "Momen Penting", kecuali pengguna memang secara khusus memintanya.
12. Jangan menuliskan penjelasan tentang teknik menulis atau proses pembuatan cerita.
13. Jangan mengubah cerita menjadi rangkuman.
14. Jangan membuat daftar karakter.
15. Jangan menggunakan simbol bullet seperti -, *, atau • untuk menyusun isi cerita.
16. Jika ada beberapa kejadian, rangkai semuanya menjadi satu alur cerita yang alami.
17. Gunakan dialog secara wajar ketika sesuai dengan adegan.
18. Tunjukkan emosi melalui tindakan dan situasi, bukan hanya dengan mengatakan bahwa tokoh merasa sedih, senang, marah, atau takut.
19. Buat suasana tempat terasa nyata dengan detail yang relevan.
20. Hindari bahasa yang terlalu kaku atau seperti buku pelajaran.
21. Jangan mengawali tulisan dengan kalimat seperti "Berikut adalah cerita..." atau "Kisah ini menceritakan...".
22. Langsung masuk ke dalam cerita.
23. Jangan memberikan kesimpulan atau pesan moral di akhir kecuali memang menjadi bagian alami dari cerita.
24. Pertahankan nama, kejadian, dan informasi penting yang diberikan pengguna.
25. Jika informasi pengguna masih sederhana, kembangkan menjadi adegan dan narasi yang lebih kaya tanpa keluar dari konteks.
26. Gunakan bahasa Indonesia yang natural, indah, dan mudah dibaca.
27. Prioritaskan pengalaman pembaca seolah-olah sedang membaca novel sungguhan.

HASIL AKHIR HARUS BERUPA NARASI NOVEL SAJA.
Jangan tambahkan komentar, penjelasan, daftar, tabel, atau format lain di luar cerita.
`;

      // Proses penulisan AI
      const aiResponse = await fetch(
        "https://api.groq.com/openai/v1/responses",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            input: novelPrompt
          })
        }
      );

      const aiResult = await aiResponse.json();

      if (!aiResponse.ok) {
        throw new Error(
          aiResult.error?.message || "Groq gagal memproses tulisan."
        );
      }

      const hasil = aiResult.output
        ?.flatMap(item => item.content || [])
        ?.filter(item => item.type === "output_text")
        ?.map(item => item.text)
        ?.join("\n") || "";

      if (!hasil) {
        throw new Error("AI tidak menghasilkan tulisan.");
      }

      // Simpan riwayat tulisan
      const saveHistory = await fetch(
        `${url}/rest/v1/riwayat_penulisan`,
        {
          method: "POST",
          headers: {
            "apikey": anonKey,
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({
            user_id: user.id,
            judul: body.judul || "Tulisan Baru",
            perintah: String(prompt),
            hasil_tulisan: hasil,
            model_ai: model
          })
        }
      );

      if (!saveHistory.ok) {
        const errorDetail = await saveHistory.text();
        throw new Error(
          "Gagal menyimpan riwayat: " + errorDetail
        );
      }

      // Catat penggunaan AI
      const saveUsage = await fetch(
        `${url}/rest/v1/penggunaan_ai`,
        {
          method: "POST",
          headers: {
            "apikey": anonKey,
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({
            user_id: user.id,
            jenis_tulisan: body.jenis || "Novel",
            jumlah_karakter: hasil.length,
            model_ai: model,
            status: "berhasil"
          })
        }
      );

      if (!saveUsage.ok) {
        const errorDetail = await saveUsage.text();
        throw new Error(
          "Gagal mencatat penggunaan AI: " + errorDetail
        );
      }

      return Response.json({
        success: true,
        text: hasil,
        model: model,
        message: "Novel berhasil dibuat dan disimpan."
      }, { headers });

    } catch (error) {
      return Response.json({
        success: false,
        error: error.message
      }, { status: 500, headers });
    }
  }
};
