export default {
  async fetch(request, env) {

    const allowedOrigin =
      "https://pena-ai-engine.pages.dev";

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    };


    // =====================================================
    // CORS
    // =====================================================

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }


    // =====================================================
    // CEK BACKEND
    // =====================================================

    if (request.method === "GET") {

      return new Response(
        JSON.stringify({
          success: true,
          app: "PENA AI",
          status: "Backend aktif",
          version: "Novel Studio"
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json"
          }
        }
      );
    }


    // =====================================================
    // HANYA POST
    // =====================================================

    if (request.method !== "POST") {

      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Method tidak diizinkan."
        }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json"
          }
        }
      );
    }


    try {

      // ===================================================
      // ENV
      // ===================================================

      const SUPABASE_URL =
        env.SUPABASE_URL;

      const SUPABASE_ANON_KEY =
        env.SUPABASE_ANON_KEY;

      const GROQ_API_KEY =
        env.GROQ_API_KEY;


      if (
        !SUPABASE_URL ||
        !SUPABASE_ANON_KEY ||
        !GROQ_API_KEY
      ) {

        throw new Error(
          "Konfigurasi backend belum lengkap."
        );
      }


      // ===================================================
      // TOKEN
      // ===================================================

      const authHeader =
        request.headers.get(
          "Authorization"
        );


      if (
        !authHeader ||
        !authHeader.startsWith(
          "Bearer "
        )
      ) {

        throw new Error(
          "Token login tidak ditemukan."
        );
      }


      const token =
        authHeader
          .replace("Bearer ", "")
          .trim();


      if (!token) {

        throw new Error(
          "Token login kosong."
        );
      }


      // ===================================================
      // VERIFIKASI USER
      // ===================================================

      const userResponse =
        await fetch(
          `${SUPABASE_URL}/auth/v1/user`,
          {
            method: "GET",

            headers: {
              "Authorization":
                `Bearer ${token}`,

              "apikey":
                SUPABASE_ANON_KEY
            }
          }
        );


      if (!userResponse.ok) {

        const error =
          await userResponse.text();

        throw new Error(
          "Sesi login tidak valid: " +
          error
        );
      }


      const user =
        await userResponse.json();


      if (!user?.id) {

        throw new Error(
          "Data pengguna tidak ditemukan."
        );
      }


      // ===================================================
      // BACA REQUEST
      // ===================================================

      const body =
        await request.json();


      const action =
        String(
          body.action ||
          "write"
        );


      // ===================================================
      // ACTION:
      // TULIS NOVEL BIASA
      // ===================================================

      if (
        action === "write"
      ) {

        return await tulisNovel(
          body,
          user,
          token,
          env,
          corsHeaders
        );
      }


      // ===================================================
      // ACTION:
      // BUAT NOVEL
      // ===================================================

      if (
        action === "create_novel"
      ) {

        return await buatNovel(
          body,
          user,
          token,
          env,
          corsHeaders
        );
      }


      // ===================================================
      // ACTION:
      // TULIS BAB
      // ===================================================

      if (
        action === "write_chapter"
      ) {

        return await tulisBab(
          body,
          user,
          token,
          env,
          corsHeaders
        );
      }


      // ===================================================
      // ACTION:
      // UPDATE MEMORY
      // ===================================================

      if (
        action === "update_memory"
      ) {

        return await updateMemory(
          body,
          user,
          token,
          env,
          corsHeaders
        );
      }


      throw new Error(
        "Action tidak dikenal: " +
        action
      );


    } catch (error) {

      return new Response(
        JSON.stringify({
          success: false,
          error:
            error?.message ||
            "Terjadi kesalahan."
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json"
          }
        }
      );
    }
  }
};



// =========================================================
// FUNGSI SUPABASE
// =========================================================

async function supabaseFetch(
  env,
  token,
  path,
  options = {}
) {

  return fetch(
    `${env.SUPABASE_URL}${path}`,
    {
      ...options,

      headers: {
        "Content-Type":
          "application/json",

        "Authorization":
          `Bearer ${token}`,

        "apikey":
          env.SUPABASE_ANON_KEY,

        ...(options.headers || {})
      }
    }
  );
}



// =========================================================
// BUAT NOVEL
// =========================================================

async function buatNovel(
  body,
  user,
  token,
  env,
  corsHeaders
) {

  const data = {

    user_id:
      user.id,

    judul:
      String(
        body.judul ||
        "Novel Baru"
      ).trim(),

    genre:
      String(
        body.genre ||
        "Drama"
      ).trim(),

    gaya:
      String(
        body.gaya ||
        "Natural"
      ).trim(),

    nuansa:
      String(
        body.nuansa ||
        "Emosional"
      ).trim(),

    mode:
      String(
        body.mode ||
        "Normal"
      ).trim(),

    premis:
      String(
        body.premis ||
        ""
      ).trim(),

    target_bab:
      Number(
        body.target_bab ||
        100
      ),

    bab_selesai:
      0,

    status:
      "aktif"
  };


  const response =
    await supabaseFetch(
      env,
      token,
      "/rest/v1/novel",
      {
        method:
          "POST",

        headers: {
          "Prefer":
            "return=representation"
        },

        body:
          JSON.stringify(data)
      }
    );


  if (!response.ok) {

    throw new Error(
      "Gagal membuat novel: " +
      await response.text()
    );
  }


  const result =
    await response.json();


  return new Response(
    JSON.stringify({
      success:
        true,

      novel:
        result[0]
    }),
    {
      status: 200,

      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json"
      }
    }
  );
}



// =========================================================
// TULIS BAB
// =========================================================

async function tulisBab(
  body,
  user,
  token,
  env,
  corsHeaders
) {

  const novelId =
    Number(
      body.novel_id
    );


  if (!novelId) {

    throw new Error(
      "ID novel belum diberikan."
    );
  }


  // =======================================================
  // AMBIL NOVEL
  // =======================================================

  const novelResponse =
    await supabaseFetch(
      env,
      token,
      `/rest/v1/novel?id=eq.${novelId}&user_id=eq.${user.id}&select=*`,
      {
        method:
          "GET"
      }
    );


  if (!novelResponse.ok) {

    throw new Error(
      "Gagal mengambil data novel."
    );
  }


  const novelData =
    await novelResponse.json();


  if (!novelData.length) {

    throw new Error(
      "Novel tidak ditemukan."
    );
  }


  const novel =
    novelData[0];


  // =======================================================
  // NOMOR BAB
  // =======================================================

  const nomorBab =
    Number(
      body.nomor_bab ||
      (novel.bab_selesai + 1)
    );


  // =======================================================
  // AMBIL KARAKTER
  // =======================================================

  const karakterResponse =
    await supabaseFetch(
      env,
      token,
      `/rest/v1/novel_karakter?novel_id=eq.${novelId}&user_id=eq.${user.id}&select=*`,
      {
        method:
          "GET"
      }
    );


  const karakter =
    karakterResponse.ok
      ? await karakterResponse.json()
      : [];


  // =======================================================
  // AMBIL MEMORY
  // =======================================================

  const memoryResponse =
    await supabaseFetch(
      env,
      token,
      `/rest/v1/novel_memory?novel_id=eq.${novelId}&user_id=eq.${user.id}&select=*&order=updated_at.desc&limit=30`,
      {
        method:
          "GET"
      }
    );


  const memory =
    memoryResponse.ok
      ? await memoryResponse.json()
      : [];


  // =======================================================
  // AMBIL BAB SEBELUMNYA
  // =======================================================

  const previousResponse =
    await supabaseFetch(
      env,
      token,
      `/rest/v1/novel_bab?novel_id=eq.${novelId}&user_id=eq.${user.id}&select=nomor_bab,judul_bab,ringkasan&order=nomor_bab.desc&limit=5`,
      {
        method:
          "GET"
      }
    );


  const previousChapters =
    previousResponse.ok
      ? await previousResponse.json()
      : [];


  // =======================================================
  // FORMAT KARAKTER
  // =======================================================

  const karakterText =
    karakter.length
      ? karakter.map(k => {

          return `
Nama: ${k.nama}
Umur: ${k.umur || ""}
Peran: ${k.peran || ""}
Sifat: ${k.sifat || ""}
Latar belakang: ${k.latar_belakang || ""}
Hubungan: ${k.hubungan || ""}
Tujuan: ${k.tujuan || ""}
Rahasia: ${k.rahasia || ""}
Catatan: ${k.catatan || ""}
`;

        }).join("\n")
      : "Belum ada data karakter khusus.";


  // =======================================================
  // FORMAT MEMORY
  // =======================================================

  const memoryText =
    memory.length
      ? memory.map(m => {

          return `
[${m.tipe}]
${m.judul}

${m.isi}
`;

        }).join("\n")
      : "Belum ada memory cerita.";


  // =======================================================
  // FORMAT BAB SEBELUMNYA
  // =======================================================

  const previousText =
    previousChapters.length
      ? previousChapters
          .reverse()
          .map(b => {

            return `
Bab ${b.nomor_bab}
${b.judul_bab}

Ringkasan:
${b.ringkasan}
`;

          }).join("\n")
      : "Ini adalah bab pertama.";


  // =======================================================
  // PROMPT BAB
  // =======================================================

  const prompt = `

Kamu adalah novelis profesional.

Tugasmu adalah menulis BAB ${nomorBab}
dari sebuah novel yang sedang berlangsung.

NOVEL:
${novel.judul}

GENRE:
${novel.genre}

GAYA:
${novel.gaya}

NUANSA:
${novel.nuansa}

MODE:
${novel.mode}

PREMIS:
${novel.premis}

==================================================
KARAKTER
==================================================

${karakterText}

==================================================
MEMORY CERITA
==================================================

${memoryText}

==================================================
BAB-BAB TERAKHIR
==================================================

${previousText}

==================================================
INSTRUKSI
==================================================

Tulis Bab ${nomorBab} secara langsung.

Jangan membuat outline.

Jangan membuat daftar.

Jangan membuat tabel.

Jangan menggunakan Markdown.

Jangan menggunakan bullet.

Jangan menggunakan format laporan.

Jangan menulis "Bab ${nomorBab}:" sebagai judul.

Jangan membuat bagian "Refleksi",
"Kesimpulan", atau "Pesan Moral".

Gunakan prosa novel yang alami.

Gunakan adegan.

Gunakan dialog yang natural.

Gunakan tindakan tokoh.

Gunakan ekspresi.

Gunakan suasana tempat.

Gunakan pikiran dan perasaan tokoh.

Bangun konflik dan ketegangan secara bertahap.

Hubungkan kejadian bab ini dengan
perkembangan cerita sebelumnya.

Jangan mengulang isi bab sebelumnya.

Pertahankan konsistensi umur,
nama, karakter, hubungan,
lokasi, dan fakta cerita.

Jika MODE adalah Dewasa 18+,
semua karakter yang terlibat dalam
romansa harus merupakan orang dewasa.
Tetap gunakan penulisan dewasa yang
tidak grafis.

Akhiri bab dengan perkembangan yang
membuat cerita dapat berlanjut ke bab
berikutnya.

Hanya hasilkan isi cerita.

Mulai langsung dengan adegan.
`;


  // =======================================================
  // PANGGIL GROQ
  // =======================================================

  const aiResponse =
    await fetch(
      "https://api.groq.com/openai/v1/responses",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          "Authorization":
            `Bearer ${env.GROQ_API_KEY}`
        },

        body:
          JSON.stringify({
            model:
              "openai/gpt-oss-120b",

            input:
              prompt
          })
      }
    );


  if (!aiResponse.ok) {

    throw new Error(
      "Gagal menghubungi AI: " +
      await aiResponse.text()
    );
  }


  const aiResult =
    await aiResponse.json();


  const hasil =
    aiResult.output
      ?.flatMap(
        item =>
          item.content || []
      )
      ?.filter(
        item =>
          item.type ===
          "output_text"
      )
      ?.map(
        item =>
          item.text
      )
      ?.join("\n")
      ?.trim() || "";


  if (!hasil) {

    throw new Error(
      "AI tidak menghasilkan isi bab."
    );
  }


  // =======================================================
  // SIMPAN BAB
  // =======================================================

  const babData = {

    novel_id:
      novelId,

    user_id:
      user.id,

    nomor_bab:
      nomorBab,

    judul_bab:
      String(
        body.judul_bab ||
        `Bab ${nomorBab}`
      ),

    isi_bab:
      hasil,

    ringkasan:
      String(
        body.ringkasan ||
        ""
      ),

    jumlah_karakter:
      hasil.length,

    status:
      "selesai"
  };


  const saveBab =
    await supabaseFetch(
      env,
      token,
      "/rest/v1/novel_bab",
      {
        method:
          "POST",

        headers: {
          "Prefer":
            "return=representation"
        },

        body:
          JSON.stringify(
            babData
          )
      }
    );


  if (!saveBab.ok) {

    throw new Error(
      "Gagal menyimpan bab: " +
      await saveBab.text()
    );
  }


  // =======================================================
  // UPDATE JUMLAH BAB
  // =======================================================

  const updateNovel =
    await supabaseFetch(
      env,
      token,
      `/rest/v1/novel?id=eq.${novelId}&user_id=eq.${user.id}`,
      {
        method:
          "PATCH",

        headers: {
          "Prefer":
            "return=minimal"
        },

        body:
          JSON.stringify({
            bab_selesai:
              Math.max(
                Number(
                  novel.bab_selesai
                ),
                nomorBab
              ),

            updated_at:
              new Date().toISOString()
          })
      }
    );


  if (!updateNovel.ok) {

    console.error(
      "Gagal update jumlah bab:",
      await updateNovel.text()
    );
  }


  return new Response(
    JSON.stringify({
      success:
        true,

      nomor_bab:
        nomorBab,

      judul_bab:
        babData.judul_bab,

      text:
        hasil,

      jumlah_karakter:
        hasil.length
    }),
    {
      status:
        200,

      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json"
      }
    }
  );
}



// =========================================================
// UPDATE MEMORY
// =========================================================

async function updateMemory(
  body,
  user,
  token,
  env,
  corsHeaders
) {

  const novelId =
    Number(
      body.novel_id
    );


  if (!novelId) {

    throw new Error(
      "ID novel belum diberikan."
    );
  }


  const memoryData = {

    novel_id:
      novelId,

    user_id:
      user.id,

    tipe:
      String(
        body.tipe ||
        "umum"
      ),

    judul:
      String(
        body.judul ||
        ""
      ),

    isi:
      String(
        body.isi ||
        ""
      ),

    penting:
      body.penting !== false,

    bab_terkait:
      Number(
        body.bab_terkait ||
        0
      )
  };


  const response =
    await supabaseFetch(
      env,
      token,
      "/rest/v1/novel_memory",
      {
        method:
          "POST",

        headers: {
          "Prefer":
            "return=representation"
        },

        body:
          JSON.stringify(
            memoryData
          )
      }
    );


  if (!response.ok) {

    throw new Error(
      "Gagal menyimpan memory: " +
      await response.text()
    );
  }


  return new Response(
    JSON.stringify({
      success:
        true,

      memory:
        (await response.json())[0]
    }),
    {
      status:
        200,

      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json"
      }
    }
  );
}



// =========================================================
// TULIS NOVEL LAMA
// =========================================================

async function tulisNovel(
  body,
  user,
  token,
  env,
  corsHeaders
) {

  const prompt =
    String(
      body.prompt ||
      body.text ||
      ""
    ).trim();


  if (!prompt) {

    throw new Error(
      "Ide tulisan belum diisi."
    );
  }


  const model =
    "openai/gpt-oss-120b";


  const novelPrompt = `

Kamu adalah NOVELIS profesional.

Tugasmu adalah menulis sebuah
cerita novel sungguhan.

IDE PENGGUNA:

${prompt}

Tulis sebagai prosa naratif
yang mengalir.

Jangan membuat laporan.

Jangan membuat makalah.

Jangan membuat outline.

Jangan membuat daftar.

Jangan membuat tabel.

Jangan menggunakan Markdown.

Jangan menggunakan bullet.

Jangan menggunakan judul bagian.

Jangan menggunakan format
"Bab 1:", "Bab 2:" dan seterusnya.

Gunakan adegan langsung.

Gunakan dialog natural.

Gunakan tindakan tokoh.

Gunakan ekspresi.

Gunakan suasana.

Gunakan pikiran dan emosi.

Jangan membuat refleksi
atau kesimpulan di akhir.

Mulai langsung dengan cerita.

Hanya tulis cerita.
`;


  const aiResponse =
    await fetch(
      "https://api.groq.com/openai/v1/responses",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          "Authorization":
            `Bearer ${env.GROQ_API_KEY}`
        },

        body:
          JSON.stringify({
            model,
            input:
              novelPrompt
          })
      }
    );


  if (!aiResponse.ok) {

    throw new Error(
      "Gagal menghubungi AI: " +
      await aiResponse.text()
    );
  }


  const aiResult =
    await aiResponse.json();


  const hasil =
    aiResult.output
      ?.flatMap(
        item =>
          item.content || []
      )
      ?.filter(
        item =>
          item.type ===
          "output_text"
      )
      ?.map(
        item =>
          item.text
      )
      ?.join("\n")
      ?.trim() || "";


  if (!hasil) {

    throw new Error(
      "AI tidak menghasilkan tulisan."
    );
  }


  // =======================================================
  // SIMPAN RIWAYAT LAMA
  // =======================================================

  const saveHistory =
    await supabaseFetch(
      env,
      token,
      "/rest/v1/riwayat_penulisan",
      {
        method:
          "POST",

        headers: {
          "Prefer":
            "return=minimal"
        },

        body:
          JSON.stringify({
            user_id:
              user.id,

            judul:
              body.judul ||
              "Tulisan Baru",

            perintah:
              prompt,

            hasil_tulisan:
              hasil,

            model_ai:
              model
          })
      }
    );


  if (!saveHistory.ok) {

    throw new Error(
      "Gagal menyimpan riwayat: " +
      await saveHistory.text()
    );
  }


  // =======================================================
  // CATAT PENGGUNAAN AI
  // =======================================================

  const usageResponse =
    await supabaseFetch(
      env,
      token,
      "/rest/v1/penggunaan_ai",
      {
        method:
          "POST",

        headers: {
          "Prefer":
            "return=minimal"
        },

        body:
          JSON.stringify({
            user_id:
              user.id,

            jenis_tulisan:
              body.jenis ||
              "Novel",

            jumlah_karakter:
              hasil.length,

            model_ai:
              model,

            status:
              "berhasil"
          })
      }
    );


  if (!usageResponse.ok) {

    console.error(
      "Gagal mencatat penggunaan AI:",
      await usageResponse.text()
    );
  }


  return new Response(
    JSON.stringify({
      success:
        true,

      text:
        hasil,

      model:
        model,

      message:
        "Tulisan berhasil dibuat dan disimpan."
    }),
    {
      status:
        200,

      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json"
      }
    }
  );
}
