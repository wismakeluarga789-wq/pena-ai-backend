export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    const corsHeaders = {
      "Access-Control-Allow-Origin":
        origin === "https://pena-ai-engine.pages.dev"
          ? origin
          : "https://pena-ai-engine.pages.dev",

      "Access-Control-Allow-Methods":
        "GET, POST, OPTIONS",

      "Access-Control-Allow-Headers":
        "Content-Type, Authorization",

      "Access-Control-Max-Age":
        "86400"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    try {
      if (request.method === "GET") {
        return json(
          {
            success: true,
            app: "PENA AI",
            status: "Backend aktif"
          },
          200,
          corsHeaders
        );
      }

      if (request.method !== "POST") {
        return json(
          {
            success: false,
            error: "Method tidak didukung."
          },
          405,
          corsHeaders
        );
      }

      const auth =
        request.headers.get("Authorization") || "";

      if (!auth.startsWith("Bearer ")) {
        return json(
          {
            success: false,
            error: "Token login tidak ditemukan."
          },
          401,
          corsHeaders
        );
      }

      const token =
        auth.replace("Bearer ", "").trim();

      const user =
        await getSupabaseUser(
          env,
          token
        );

      if (!user) {
        return json(
          {
            success: false,
            error: "Sesi login tidak valid."
          },
          401,
          corsHeaders
        );
      }

      const body =
        await request.json();

      const action =
        body.action || "write";

      if (action === "write") {
        return await tulisCepat(
          body,
          user,
          token,
          env,
          corsHeaders
        );
      }

      if (action === "create_novel") {
        return await buatNovel(
          body,
          user,
          token,
          env,
          corsHeaders
        );
      }

      if (action === "write_chapter") {
        return await tulisBab(
          body,
          user,
          token,
          env,
          corsHeaders
        );
      }

      if (action === "update_memory") {
        return await updateMemory(
          body,
          user,
          token,
          env,
          corsHeaders
        );
      }

      return json(
        {
          success: false,
          error:
            `Action "${action}" tidak dikenal.`
        },
        400,
        corsHeaders
      );

    } catch (error) {

      console.error(error);

      return json(
        {
          success: false,
          error:
            error?.message ||
            "Terjadi kesalahan pada server."
        },
        500,
        corsHeaders
      );
    }
  }
};


/* =====================================================
   RESPONSE
===================================================== */

function json(
  data,
  status,
  headers
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...headers,
        "Content-Type":
          "application/json; charset=utf-8"
      }
    }
  );
}


/* =====================================================
   SUPABASE USER
===================================================== */

async function getSupabaseUser(
  env,
  token
) {

  const response =
    await fetch(
      `${env.SUPABASE_URL}/auth/v1/user`,
      {
        method: "GET",

        headers: {
          "apikey":
            env.SUPABASE_ANON_KEY,

          "Authorization":
            `Bearer ${token}`
        }
      }
    );

  if (!response.ok) {
    return null;
  }

  return await response.json();
}


/* =====================================================
   SUPABASE FETCH
===================================================== */

async function supabaseFetch(
  env,
  token,
  path,
  options = {}
) {

  const headers = {
    "apikey":
      env.SUPABASE_ANON_KEY,

    "Authorization":
      `Bearer ${token}`,

    "Content-Type":
      "application/json",

    ...(options.headers || {})
  };

  return await fetch(
    `${env.SUPABASE_URL}/rest/v1/${path}`,
    {
      ...options,
      headers
    }
  );
}


/* =====================================================
   GROQ
===================================================== */

async function callGroq(
  env,
  messages,
  maxTokens = 9000
) {

  const response =
    await fetch(
      "https://api.groq.com/openai/v1/responses",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          "Authorization":
            `Bearer ${env.GROQ_API_KEY}`
        },

        body: JSON.stringify({
          model:
            "openai/gpt-oss-120b",

          input:
            messages,

          max_output_tokens:
            maxTokens,

          temperature:
            0.85
        })
      }
    );

  const raw =
    await response.text();

  if (!response.ok) {

    throw new Error(
      `Groq error ${response.status}: ${raw}`
    );
  }

  let data;

  try {
    data =
      JSON.parse(raw);
  } catch {
    throw new Error(
      "Respons AI tidak dapat dibaca."
    );
  }

  let text = "";

  if (
    typeof data.output_text ===
    "string"
  ) {

    text =
      data.output_text;

  } else if (
    Array.isArray(data.output)
  ) {

    for (
      const item of data.output
    ) {

      if (
        Array.isArray(
          item.content
        )
      ) {

        for (
          const content of item.content
        ) {

          if (
            typeof content.text ===
            "string"
          ) {

            text +=
              content.text;
          }
        }
      }
    }
  }

  if (!text.trim()) {

    throw new Error(
      "AI tidak menghasilkan tulisan."
    );
  }

  return text.trim();
}


/* =====================================================
   BERSIHKAN PROSA
===================================================== */

function bersihkanProsa(text) {

  return String(text || "")
    .replace(/^```[a-zA-Z]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


/* =====================================================
   HITUNG KATA
===================================================== */

function hitungKata(text) {

  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}


/* =====================================================
   TULIS CEPAT
===================================================== */

async function tulisCepat(
  body,
  user,
  token,
  env,
  corsHeaders
) {

  const judul =
    body.judul ||
    "Tulisan Baru";

  const prompt =
    body.prompt ||
    "";

  if (!prompt.trim()) {

    return json(
      {
        success: false,
        error:
          "Ide tulisan belum diisi."
      },
      400,
      corsHeaders
    );
  }

  const systemPrompt = `
Kamu adalah PENA AI, penulis novel berbahasa Indonesia.

Tugasmu adalah menulis prosa fiksi yang terasa seperti novel sungguhan.

ATURAN MUTLAK:

Tulis langsung adegan cerita.

Jangan membuat outline.

Jangan membuat daftar.

Jangan menggunakan bullet.

Jangan menggunakan Markdown.

Jangan menggunakan format laporan.

Jangan menjelaskan proses penulisan.

Jangan menulis "Bab 1:" kecuali diminta.

Gunakan paragraf naratif yang natural.

Gunakan dialog yang hidup.

Bangun suasana tempat.

Tampilkan tindakan tokoh.

Tampilkan pikiran dan emosi tokoh melalui cerita.

Jaga kesinambungan sebab dan akibat.

Jangan mengulang kalimat hanya untuk memperpanjang tulisan.

Jika cerita memiliki konflik, kembangkan secara bertahap.

Hasil akhir harus berupa prosa novel yang siap dibaca.
`;

  const userPrompt = `
Judul:
${judul}

Ide cerita:
${prompt}

Kembangkan ide tersebut menjadi cerita fiksi yang utuh.

Mulailah langsung dari adegan cerita.
`;

  const text =
    await callGroq(
      env,
      [
        {
          role:
            "system",

          content:
            systemPrompt
        },

        {
          role:
            "user",

          content:
            userPrompt
        }
      ],
      9000
    );

  const clean =
    bersihkanProsa(text);

  const history =
    await supabaseFetch(
      env,
      token,
      "riwayat_penulisan",
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

            judul,

            perintah:
              prompt,

            hasil_tulisan:
              clean,

            model_ai:
              "openai/gpt-oss-120b"
          })
      }
    );

  if (!history.ok) {

    console.error(
      "Gagal menyimpan riwayat:",
      await history.text()
    );
  }

  return json(
    {
      success: true,
      text: clean,

      jumlah_kata:
        hitungKata(clean),

      model:
        "openai/gpt-oss-120b"
    },
    200,
    corsHeaders
  );
}


/* =====================================================
   BUAT NOVEL
===================================================== */

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
      body.judul ||
      "Novel Baru",

    genre:
      body.genre ||
      "Drama",

    gaya:
      body.gaya ||
      "Natural",

    nuansa:
      body.nuansa ||
      "Emosional",

    mode:
      body.mode ||
      "Normal",

    premis:
      body.premis ||
      "",

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
      "novel",
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

  const raw =
    await response.text();

  if (!response.ok) {

    throw new Error(
      `Gagal membuat novel: ${raw}`
    );
  }

  let result;

  try {
    result =
      JSON.parse(raw);
  } catch {
    result = [];
  }

  return json(
    {
      success:
        true,

      novel:
        Array.isArray(result)
          ? result[0]
          : result
    },
    200,
    corsHeaders
  );
}


/* =====================================================
   TULIS BAB
===================================================== */

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

    return json(
      {
        success: false,
        error:
          "ID novel tidak ditemukan."
      },
      400,
      corsHeaders
    );
  }


  /* -----------------------------------------------
     AMBIL DATA NOVEL
  ------------------------------------------------ */

  const novelResponse =
    await supabaseFetch(
      env,
      token,
      `novel?id=eq.${novelId}&user_id=eq.${user.id}&select=*`,
      {
        method:
          "GET"
      }
    );

  const novelRaw =
    await novelResponse.text();

  if (!novelResponse.ok) {

    throw new Error(
      `Gagal membaca novel: ${novelRaw}`
    );
  }

  const novels =
    JSON.parse(
      novelRaw
    );

  if (
    !Array.isArray(novels) ||
    novels.length === 0
  ) {

    return json(
      {
        success: false,
        error:
          "Novel tidak ditemukan."
      },
      404,
      corsHeaders
    );
  }

  const novel =
    novels[0];


  /* -----------------------------------------------
     AMBIL KARAKTER
  ------------------------------------------------ */

  const characterResponse =
    await supabaseFetch(
      env,
      token,
      `novel_karakter?novel_id=eq.${novelId}&user_id=eq.${user.id}&select=*&order=created_at.asc`,
      {
        method:
          "GET"
      }
    );

  let characters = [];

  if (characterResponse.ok) {

    const raw =
      await characterResponse.text();

    characters =
      JSON.parse(raw);
  }


  /* -----------------------------------------------
     AMBIL MEMORY
  ------------------------------------------------ */

  const memoryResponse =
    await supabaseFetch(
      env,
      token,
      `novel_memory?novel_id=eq.${novelId}&user_id=eq.${user.id}&select=*&order=created_at.desc&limit=30`,
      {
        method:
          "GET"
      }
    );

  let memories = [];

  if (memoryResponse.ok) {

    const raw =
      await memoryResponse.text();

    memories =
      JSON.parse(raw);
  }


  /* -----------------------------------------------
     AMBIL BAB SEBELUMNYA
  ------------------------------------------------ */

  const chapterResponse =
    await supabaseFetch(
      env,
      token,
      `novel_bab?novel_id=eq.${novelId}&user_id=eq.${user.id}&select=id,nomor_bab,judul_bab,ringkasan,isi_bab,created_at&order=nomor_bab.desc&limit=5`,
      {
        method:
          "GET"
      }
    );

  let chapters = [];

  if (chapterResponse.ok) {

    const raw =
      await chapterResponse.text();

    chapters =
      JSON.parse(raw);
  }


  /* -----------------------------------------------
     NOMOR BAB
  ------------------------------------------------ */

  const nomorBab =
    Number(
      novel.bab_selesai || 0
    ) + 1;


  /* -----------------------------------------------
     KONTEKS KARAKTER
  ------------------------------------------------ */

  const characterText =
    characters.length
      ? characters.map(c => {

          return `
Nama: ${c.nama}
Umur: ${c.umur || "-"}
Jenis kelamin: ${c.jenis_kelamin || "-"}
Peran: ${c.peran || "-"}
Sifat: ${c.sifat || "-"}
Latar belakang: ${c.latar_belakang || "-"}
Hubungan: ${c.hubungan || "-"}
Tujuan: ${c.tujuan || "-"}
Rahasia: ${c.rahasia || "-"}
Catatan: ${c.catatan || "-"}
`;

        }).join("\n")
      : "Belum ada data karakter.";


  /* -----------------------------------------------
     KONTEKS MEMORY
  ------------------------------------------------ */

  const memoryText =
    memories.length
      ? memories.map(m => {

          return `
Tipe: ${m.tipe || "-"}
Judul: ${m.judul || "-"}
Isi: ${m.isi || "-"}
Bab terkait: ${m.bab_terkait || "-"}
Penting: ${m.penting ? "Ya" : "Tidak"}
`;

        }).join("\n")
      : "Belum ada memory cerita.";


  /* -----------------------------------------------
     KONTEKS BAB SEBELUMNYA
  ------------------------------------------------ */

  const previousChapterText =
    chapters.length
      ? chapters
          .reverse()
          .map(c => {

            return `
BAB ${c.nomor_bab}
Judul: ${c.judul_bab || ""}

Ringkasan:
${c.ringkasan || ""}

Isi:
${c.isi_bab || ""}
`;

          })
          .join("\n\n")
      : "Belum ada bab sebelumnya.";


  /* -----------------------------------------------
     MODE DEWASA
  ------------------------------------------------ */

  let adultInstruction = "";

  if (
    String(novel.mode)
      .toLowerCase()
      .includes("dewasa")
  ) {

    adultInstruction = `
Mode cerita adalah Dewasa 18+.

Pastikan seluruh tokoh yang terlibat
dalam hubungan romantis adalah orang dewasa.

Cerita boleh memiliki tema romantis,
hubungan emosional, ketegangan,
dan situasi dewasa secara umum,
tetapi jangan menulis adegan seksual
yang eksplisit atau pornografis.
`;
  }


  /* -----------------------------------------------
     PROMPT UTAMA
  ------------------------------------------------ */

  const systemPrompt = `
Kamu adalah PENA AI, mesin penulis novel
berbahasa Indonesia.

Kamu sedang menulis sebuah novel berkelanjutan.

Ini bukan artikel.
Ini bukan laporan.
Ini bukan makalah.
Ini bukan outline.
Ini bukan ringkasan.

HASIL HARUS LANGSUNG BERUPA PROSA NOVEL.

Target panjang bab:
sekitar 2.000 sampai 2.500 kata.

Usahakan mendekati target tersebut
tanpa mengisi cerita dengan pengulangan
atau kalimat yang tidak berguna.

PENTING:

Jangan membuat bullet.

Jangan membuat daftar.

Jangan menggunakan Markdown.

Jangan membuat tabel.

Jangan menulis penjelasan kepada pengguna.

Jangan menulis catatan penulis.

Jangan menulis "Berikut babnya".

Jangan membuat outline.

Jangan merangkum cerita sebagai pengganti adegan.

Jangan memadatkan seluruh kejadian
menjadi beberapa paragraf pendek.

Tulis adegan secara utuh.

Gunakan paragraf novel yang natural.

Gunakan dialog yang hidup.

Gunakan tindakan dan reaksi tokoh.

Bangun suasana tempat dan waktu.

Perlihatkan emosi melalui tindakan,
dialog, pikiran, ekspresi,
dan reaksi tubuh secara wajar.

Kembangkan konflik secara bertahap.

Beri ruang bagi tokoh untuk berbicara,
berpikir, bergerak, bereaksi,
dan mengambil keputusan.

Jaga hubungan antar tokoh.

Jaga kontinuitas fakta.

Jangan mengubah umur,
nama, latar belakang,
hubungan, atau sifat karakter
tanpa alasan cerita.

Jangan mengulang kejadian
yang sudah selesai pada bab sebelumnya
kecuali diperlukan sebagai ingatan
atau konteks.

Bab harus terasa sebagai kelanjutan alami
dari bab sebelumnya.

Jangan menyelesaikan seluruh konflik utama
terlalu cepat.

Bangun perkembangan cerita
agar novel dapat terus berlanjut
ke bab-bab berikutnya.

Akhiri bab dengan perkembangan,
konflik baru,
pertanyaan,
keputusan,
kejutan,
atau situasi yang membuat pembaca
ingin melanjutkan ke bab berikutnya.

Jika terdapat dialog,
buat dialog terasa alami dan sesuai
dengan kepribadian masing-masing tokoh.

${adultInstruction}
`;

  const userPrompt = `
INFORMASI NOVEL

Judul:
${novel.judul}

Genre:
${novel.genre || "Drama"}

Gaya narasi:
${novel.gaya || "Natural"}

Nuansa:
${novel.nuansa || "Emosional"}

Mode:
${novel.mode || "Normal"}

Premis:
${novel.premis || ""}

Target jumlah bab:
${novel.target_bab || 100}

Bab yang akan ditulis:
Bab ${nomorBab}


KARAKTER

${characterText}


MEMORY CERITA

${memoryText}


BAB-BAB TERAKHIR

${previousChapterText}


TUGAS

Tulis Bab ${nomorBab} dari novel ini.

Panjang target sekitar 2.000–2.500 kata.

Mulai langsung dari adegan.

Jangan memberikan judul bab
sebagai heading Markdown.

Jangan membuat daftar.

Jangan memberikan ringkasan
di awal atau akhir.

Jangan menjelaskan apa yang kamu lakukan.

Tulislah seperti halaman novel
yang langsung siap dibaca.
`;


  /* -----------------------------------------------
     GENERATE
  ------------------------------------------------ */

  let chapterText =
    await callGroq(
      env,
      [
        {
          role:
            "system",

          content:
            systemPrompt
        },

        {
          role:
            "user",

          content:
            userPrompt
        }
      ],
      12000
    );


  chapterText =
    bersihkanProsa(
      chapterText
    );


  let jumlahKata =
    hitungKata(
      chapterText
    );


  /* -----------------------------------------------
     JIKA TERLALU PENDEK
  ------------------------------------------------ */

  if (jumlahKata < 1600) {

    const continuePrompt = `
Cerita yang baru ditulis masih terlalu pendek.

Jangan mengulang paragraf sebelumnya.

Lanjutkan cerita secara langsung
dari kalimat terakhir.

Tambahkan adegan baru yang relevan
dengan konflik dan karakter.

Kembangkan interaksi,
dialog,
suasana,
tindakan,
pikiran,
reaksi,
dan konsekuensi kejadian.

Jangan membuat ringkasan.

Jangan membuat bullet.

Jangan menggunakan Markdown.

Jangan menjelaskan proses penulisan.

Teruskan prosa novel sampai total
panjang bab mendekati 2.000–2.500 kata.

Teks yang sudah ada:

${chapterText}
`;

    const tambahan =
      await callGroq(
        env,
        [
          {
            role:
              "system",

            content:
              systemPrompt
          },

          {
            role:
              "user",

            content:
              continuePrompt
          }
        ],
        5000
      );

    const tambahanClean =
      bersihkanProsa(
        tambahan
      );

    /*
     * Model kadang mengulang cerita lama.
     * Karena itu hanya tambahkan bagian
     * yang memang dihasilkan setelah prompt
     * lanjutan.
     */

    chapterText =
      chapterText +
      "\n\n" +
      tambahanClean;

    jumlahKata =
      hitungKata(
        chapterText
      );
  }


  /* -----------------------------------------------
     JUDUL BAB
  ------------------------------------------------ */

  const titlePrompt = `
Berikan satu judul pendek
untuk bab berikut.

Judul harus cocok dengan isi bab.

Hanya tulis judulnya.

Jangan memakai Markdown.

Jangan menulis "Bab ${nomorBab}".

Isi bab:

${chapterText.slice(0, 6000)}
`;

  let judulBab =
    await callGroq(
      env,
      [
        {
          role:
            "system",

          content:
            "Kamu adalah editor novel."
        },

        {
          role:
            "user",

          content:
            titlePrompt
        }
      ],
      200
    );

  judulBab =
    bersihkanProsa(
      judulBab
    )
      .replace(/^["']|["']$/g, "")
      .trim();


  /* -----------------------------------------------
     SIMPAN BAB
  ------------------------------------------------ */

  const chapterData = {

    novel_id:
      novelId,

    user_id:
      user.id,

    nomor_bab:
      nomorBab,

    judul_bab:
      judulBab ||
      `Bab ${nomorBab}`,

    isi_bab:
      chapterText,

    ringkasan:
      "",

    jumlah_karakter:
      chapterText.length,

    status:
      "selesai"

  };


  const insertResponse =
    await supabaseFetch(
      env,
      token,
      "novel_bab",
      {
        method:
          "POST",

        headers: {
          "Prefer":
            "return=representation"
        },

        body:
          JSON.stringify(
            chapterData
          )
      }
    );

  const insertRaw =
    await insertResponse.text();

  if (!insertResponse.ok) {

    throw new Error(
      `Gagal menyimpan bab: ${insertRaw}`
    );
  }


  /* -----------------------------------------------
     UPDATE JUMLAH BAB
  ------------------------------------------------ */

  const updateResponse =
    await supabaseFetch(
      env,
      token,
      `novel?id=eq.${novelId}&user_id=eq.${user.id}`,
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
              nomorBab,

            updated_at:
              new Date().toISOString()

          })
      }
    );

  if (!updateResponse.ok) {

    console.error(
      "Gagal update bab_selesai:",
      await updateResponse.text()
    );
  }


  /* -----------------------------------------------
     SIMPAN PENGGUNAAN AI
  ------------------------------------------------ */

  try {

    await supabaseFetch(
      env,
      token,
      "penggunaan_ai",
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
              "Novel Bab",

            jumlah_karakter:
              chapterText.length,

            model_ai:
              "openai/gpt-oss-120b",

            status:
              "berhasil"

          })
      }
    );

  } catch (e) {

    console.error(
      "Gagal menyimpan penggunaan AI:",
      e
    );
  }


  /* -----------------------------------------------
     RESPONSE
  ------------------------------------------------ */

  return json(
    {
      success:
        true,

      novel_id:
        novelId,

      nomor_bab:
        nomorBab,

      judul_bab:
        judulBab,

      text:
        chapterText,

      jumlah_kata:
        jumlahKata,

      jumlah_karakter:
        chapterText.length
    },
    200,
    corsHeaders
  );
}


/* =====================================================
   UPDATE MEMORY
===================================================== */

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

    return json(
      {
        success: false,
        error:
          "ID novel tidak ditemukan."
      },
      400,
      corsHeaders
    );
  }

  const data = {

    novel_id:
      novelId,

    user_id:
      user.id,

    tipe:
      body.tipe ||
      "kejadian",

    judul:
      body.judul ||
      "Memory Cerita",

    isi:
      body.isi ||
      "",

    penting:
      body.penting ??
      true,

    bab_terkait:
      body.bab_terkait
        ? Number(
            body.bab_terkait
          )
        : null

  };

  const response =
    await supabaseFetch(
      env,
      token,
      "novel_memory",
      {
        method:
          "POST",

        headers: {
          "Prefer":
            "return=representation"
        },

        body:
          JSON.stringify(
            data
          )
      }
    );

  const raw =
    await response.text();

  if (!response.ok) {

    throw new Error(
      `Gagal menyimpan memory: ${raw}`
    );
  }

  let result;

  try {
    result =
      JSON.parse(raw);
  } catch {
    result = [];
  }

  return json(
    {
      success:
        true,

      memory:
        Array.isArray(result)
          ? result[0]
          : result
    },
    200,
    corsHeaders
  );
}
