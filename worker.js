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
        await getSupabaseUser(env, token);

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
   JSON RESPONSE
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
   GET SUPABASE USER
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
  maxTokens
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
            0.82
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
Kamu adalah PENA AI, penulis novel
berbahasa Indonesia.

Tulis prosa fiksi yang terasa seperti
novel sungguhan.

Jangan membuat outline.
Jangan membuat bullet.
Jangan membuat tabel.
Jangan menggunakan Markdown.
Jangan membuat laporan.
Jangan menjelaskan proses menulis.

Tulis langsung adegan cerita.

Gunakan paragraf naratif yang natural,
dialog yang hidup,
suasana,
tindakan,
pikiran,
emosi,
konflik,
dan perkembangan karakter.

Hasil harus berupa prosa novel
yang siap dibaca.
`;

  const userPrompt = `
Judul:
${judul}

Ide cerita:
${prompt}

Kembangkan menjadi cerita fiksi
yang utuh dan menarik.

Mulai langsung dari adegan cerita.
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
      6000
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

  let result = [];

  try {
    result =
      JSON.parse(raw);
  } catch {}

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


  /* ===================================================
     NOVEL
  =================================================== */

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


  /* ===================================================
     KARAKTER
  =================================================== */

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

    characters =
      await characterResponse.json();
  }


  /* ===================================================
     MEMORY
  =================================================== */

  const memoryResponse =
    await supabaseFetch(
      env,
      token,
      `novel_memory?novel_id=eq.${novelId}&user_id=eq.${user.id}&select=*&order=created_at.desc&limit=20`,
      {
        method:
          "GET"
      }
    );

  let memories = [];

  if (memoryResponse.ok) {

    memories =
      await memoryResponse.json();
  }


  /* ===================================================
     BAB TERAKHIR
  =================================================== */

  const chapterResponse =
    await supabaseFetch(
      env,
      token,
      `novel_bab?novel_id=eq.${novelId}&user_id=eq.${user.id}&select=id,nomor_bab,judul_bab,ringkasan,isi_bab&order=nomor_bab.desc&limit=3`,
      {
        method:
          "GET"
      }
    );

  let chapters = [];

  if (chapterResponse.ok) {

    chapters =
      await chapterResponse.json();
  }


  const nomorBab =
    Number(
      novel.bab_selesai || 0
    ) + 1;


  /* ===================================================
     KARAKTER TEXT
  =================================================== */

  let characterText =
    "Belum ada karakter.";

  if (characters.length) {

    characterText =
      characters.map(c => {

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

      }).join("\n");
  }


  /* ===================================================
     MEMORY TEXT
  =================================================== */

  let memoryText =
    "Belum ada memory cerita.";

  if (memories.length) {

    memoryText =
      memories.map(m => {

        return `
Tipe: ${m.tipe || "-"}
Judul: ${m.judul || "-"}
Isi: ${m.isi || "-"}
Bab terkait: ${m.bab_terkait || "-"}
Penting: ${m.penting ? "Ya" : "Tidak"}
`;

      }).join("\n");
  }


  /* ===================================================
     BAB SEBELUMNYA
  =================================================== */

  let previousText =
    "Belum ada bab sebelumnya.";

  if (chapters.length) {

    const ordered =
      [...chapters].reverse();

    previousText =
      ordered.map(c => {

        return `
BAB ${c.nomor_bab}

Judul:
${c.judul_bab || ""}

Ringkasan:
${c.ringkasan || ""}

Isi:
${c.isi_bab || ""}
`;

      }).join("\n\n");
  }


  /* ===================================================
     MODE DEWASA
  =================================================== */

  let adultInstruction = "";

  if (
    String(novel.mode)
      .toLowerCase()
      .includes("dewasa")
  ) {

    adultInstruction = `
Novel menggunakan mode Dewasa 18+.

Pastikan seluruh tokoh yang terlibat
dalam hubungan romantis adalah orang dewasa.

Tema romantis dan hubungan dewasa
boleh menjadi bagian cerita,
tetapi jangan menulis adegan seksual
secara eksplisit atau pornografis.
`;
  }


  /* ===================================================
     SYSTEM PROMPT
  =================================================== */

  const systemPrompt = `
Kamu adalah PENA AI,
penulis novel profesional
berbahasa Indonesia.

Kamu sedang menulis satu bab
dari sebuah novel yang berkelanjutan.

HASIL HARUS LANGSUNG BERUPA PROSA NOVEL.

Target:
sekitar 2.000–2.300 kata.

PENTING:

Jangan membuat outline.

Jangan membuat daftar.

Jangan menggunakan bullet.

Jangan menggunakan Markdown.

Jangan membuat tabel.

Jangan membuat laporan.

Jangan memberikan penjelasan.

Jangan menulis "Berikut babnya".

Jangan menulis "Bab ${nomorBab}"
sebagai heading.

Jangan membuat ringkasan
sebagai pengganti cerita.

Tulis langsung adegan.

Gunakan paragraf yang natural.

Gunakan dialog yang hidup.

Gunakan tindakan tokoh.

Gunakan ekspresi,
pikiran,
emosi,
suasana,
konflik,
dan konsekuensi.

Jangan mempercepat semua kejadian
hanya agar cerita cepat selesai.

Kembangkan adegan secara bertahap.

Setiap kejadian harus memiliki
sebab dan akibat.

Jaga konsistensi karakter.

Jaga konsistensi hubungan.

Jaga konsistensi tempat,
waktu,
dan fakta cerita.

Jangan mengulang isi bab sebelumnya
secara panjang.

Bab baru harus terasa sebagai
kelanjutan langsung dari cerita.

Jangan menyelesaikan semua konflik utama
dalam satu bab.

Buat perkembangan yang membuka
kemungkinan bab berikutnya.

Akhiri dengan situasi,
keputusan,
informasi,
konflik,
atau kejadian
yang membuat pembaca ingin
membaca bab selanjutnya.

${adultInstruction}
`;


  /* ===================================================
     USER PROMPT
  =================================================== */

  const userPrompt = `
NOVEL

Judul:
${novel.judul}

Genre:
${novel.genre || "Drama"}

Gaya:
${novel.gaya || "Natural"}

Nuansa:
${novel.nuansa || "Emosional"}

Mode:
${novel.mode || "Normal"}

Premis:
${novel.premis || ""}

Bab yang akan ditulis:
${nomorBab}


KARAKTER

${characterText}


MEMORY CERITA

${memoryText}


BAB-BAB TERAKHIR

${previousText}


TUGAS

Tulislah Bab ${nomorBab}.

Target panjang sekitar
2.000–2.300 kata.

Mulai langsung dari adegan.

Jangan membuat heading.

Jangan membuat bullet.

Jangan membuat ringkasan.

Jangan menjelaskan proses penulisan.

Jangan mengakhiri cerita terlalu cepat.

Tulis seperti halaman novel
yang langsung siap dibaca.
`;


  /* ===================================================
     SATU PANGGILAN GROQ
  =================================================== */

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
      6500
    );


  chapterText =
    bersihkanProsa(
      chapterText
    );


  const jumlahKata =
    hitungKata(
      chapterText
    );


  /* ===================================================
     JUDUL BAB TANPA PANGGILAN AI
  =================================================== */

  const judulBab =
    `Bab ${nomorBab}`;


  /* ===================================================
     SIMPAN BAB
  =================================================== */

  const chapterData = {

    novel_id:
      novelId,

    user_id:
      user.id,

    nomor_bab:
      nomorBab,

    judul_bab:
      judulBab,

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


  /* ===================================================
     UPDATE NOVEL
  =================================================== */

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
      "Gagal update novel:",
      await updateResponse.text()
    );
  }


  /* ===================================================
     CATAT PENGGUNAAN AI
  =================================================== */

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
      "Gagal mencatat penggunaan AI:",
      e
    );
  }


  /* ===================================================
     HASIL
  =================================================== */

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

  let result = [];

  try {
    result =
      JSON.parse(raw);
  } catch {}

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
