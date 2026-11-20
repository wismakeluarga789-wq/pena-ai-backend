const corsHeaders = {
  "Access-Control-Allow-Origin": "https://pena-ai-engine.pages.dev",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function cleanText(text, max = 5000) {
  if (!text) return "";
  return String(text).slice(0, max);
}

function hitungKata(text) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

/* =========================
   SUPABASE
========================= */

async function supabaseUserFetch(path, token, env, options = {}) {
  const headers = {
    "apikey": env.SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers
  });
}

async function getUser(token, env) {
  const res = await fetch(
    `${env.SUPABASE_URL}/auth/v1/user`,
    {
      headers: {
        "apikey": env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${token}`
      }
    }
  );

  if (!res.ok) {
    return null;
  }

  return await res.json();
}

/* =========================
   GROQ
========================= */

async function callGroq(messages, env, maxOutputTokens = 4500) {
  const response = await fetch(
    "https://api.groq.com/openai/v1/responses",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        input: messages,
        temperature: 0.85,
        max_output_tokens: maxOutputTokens
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Groq error ${response.status}: ${JSON.stringify(data)}`
    );
  }

  let text = "";

  if (data.output_text) {
    text = data.output_text;
  } else if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (Array.isArray(item.content)) {
        for (const content of item.content) {
          if (content.text) {
            text += content.text;
          }
        }
      }
    }
  }

  return text.trim();
}

/* =========================
   QUICK WRITE
========================= */

async function tulisCepat(body, user, token, env) {
  const judul = cleanText(body.judul, 300);
  const perintah = cleanText(body.prompt, 5000);
  const mode = body.mode || "Normal";

  if (!perintah) {
    throw new Error("Perintah tulisan belum diisi.");
  }

  const systemPrompt = `
Kamu adalah penulis novel profesional berbahasa Indonesia.

Tulis cerita dalam bentuk PROSA NOVEL yang benar.

Jangan menggunakan:
- Markdown
- bullet
- numbering
- outline
- laporan
- penjelasan proses
- kata "Bab" di dalam isi cerita

Cerita harus terasa seperti novel yang benar-benar sedang berlangsung.

Gunakan:
- narasi
- dialog
- suasana
- tindakan tokoh
- pikiran tokoh
- emosi
- konflik
- detail tempat
- perkembangan kejadian

Jangan menjelaskan kepada pembaca bahwa kamu adalah AI.

Jika judul atau perintah mengandung instruksi teknis, ubah menjadi cerita yang natural.

Mode cerita: ${mode}

Jika terdapat unsur romantis, semua tokoh yang terlibat harus merupakan orang dewasa.
`;

  const messages = [
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "user",
      content: `
Judul:
${judul || "Tanpa Judul"}

Perintah penulis:
${perintah}

Tulislah cerita lengkap berdasarkan perintah tersebut.
`
    }
  ];

  const hasil = await callGroq(
    messages,
    env,
    4500
  );

  if (!hasil) {
    throw new Error("AI tidak menghasilkan tulisan.");
  }

  return json({
    success: true,
    hasil_tulisan: hasil,
    jumlah_kata: hitungKata(hasil),
    model_ai: "openai/gpt-oss-120b"
  });
}

/* =========================
   BUAT NOVEL
========================= */

async function buatNovel(body, user, token, env) {
  const data = {
    user_id: user.id,
    judul: cleanText(body.judul, 300),
    genre: cleanText(body.genre, 100),
    gaya: cleanText(body.gaya, 200),
    nuansa: cleanText(body.nuansa, 200),
    mode: cleanText(body.mode || "Normal", 50),
    premis: cleanText(body.premis, 5000),
    target_bab: Number(body.target_bab || 100),
    bab_selesai: 0,
    status: "aktif"
  };

  const res = await supabaseUserFetch(
    "novel",
    token,
    env,
    {
      method: "POST",
      headers: {
        "Prefer": "return=representation"
      },
      body: JSON.stringify(data)
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gagal membuat novel: ${err}`);
  }

  const result = await res.json();

  return json({
    success: true,
    novel: result[0]
  });
}

/* =========================
   AMBIL NOVEL
========================= */

async function ambilNovel(novelId, user, token, env) {
  const res = await supabaseUserFetch(
    `novel?id=eq.${encodeURIComponent(novelId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*`,
    token,
    env
  );

  if (!res.ok) {
    throw new Error("Gagal mengambil data novel.");
  }

  const rows = await res.json();

  if (!rows.length) {
    throw new Error("Novel tidak ditemukan.");
  }

  return rows[0];
}

/* =========================
   KARAKTER
========================= */

async function ambilKarakter(novelId, user, token, env) {
  const res = await supabaseUserFetch(
    `novel_karakter?novel_id=eq.${encodeURIComponent(novelId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*&order=id.asc`,
    token,
    env
  );

  if (!res.ok) {
    return [];
  }

  return await res.json();
}

/* =========================
   MEMORY
========================= */

async function ambilMemory(novelId, user, token, env) {
  const res = await supabaseUserFetch(
    `novel_memory?novel_id=eq.${encodeURIComponent(novelId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*&order=penting.desc,updated_at.desc&limit=15`,
    token,
    env
  );

  if (!res.ok) {
    return [];
  }

  return await res.json();
}

/* =========================
   BAB TERAKHIR
========================= */

async function ambilBabTerakhir(novelId, user, token, env) {
  const res = await supabaseUserFetch(
    `novel_bab?novel_id=eq.${encodeURIComponent(novelId)}&user_id=eq.${encodeURIComponent(user.id)}&select=nomor_bab,judul_bab,isi_bab,ringkasan&order=nomor_bab.desc&limit=1`,
    token,
    env
  );

  if (!res.ok) {
    return [];
  }

  return await res.json();
}

/* =========================
   FORMAT KARAKTER
========================= */

function formatKarakter(karakter) {
  if (!karakter.length) {
    return "Belum ada data karakter.";
  }

  return karakter
    .slice(0, 15)
    .map(k => {
      return `
Nama: ${k.nama}
Umur: ${k.umur || "-"}
Peran: ${k.peran || "-"}
Sifat: ${k.sifat || "-"}
Latar belakang: ${k.latar_belakang || "-"}
Hubungan: ${k.hubungan || "-"}
Tujuan: ${k.tujuan || "-"}
Rahasia: ${k.rahasia || "-"}
`;
    })
    .join("\n");
}

/* =========================
   FORMAT MEMORY
========================= */

function formatMemory(memory) {
  if (!memory.length) {
    return "Belum ada memory khusus.";
  }

  return memory
    .slice(0, 10)
    .map(m => {
      return `
${m.tipe || "Memory"}:
${cleanText(m.judul, 200)}

${cleanText(m.isi, 800)}
`;
    })
    .join("\n");
}

/* =========================
   TULIS BAB
========================= */

async function tulisBab(body, user, token, env) {
  const novelId = body.novel_id;

  if (!novelId) {
    throw new Error("ID novel tidak ditemukan.");
  }

  const novel = await ambilNovel(
    novelId,
    user,
    token,
    env
  );

  const karakter = await ambilKarakter(
    novelId,
    user,
    token,
    env
  );

  const memory = await ambilMemory(
    novelId,
    user,
    token,
    env
  );

  const babTerakhir = await ambilBabTerakhir(
    novelId,
    user,
    token,
    env
  );

  const nomorBab =
    Number(novel.bab_selesai || 0) + 1;

  let konteksBabSebelumnya = "";

  if (babTerakhir.length) {
    const bab = babTerakhir[0];

    const isi = String(
      bab.isi_bab || ""
    );

    konteksBabSebelumnya = `
BAB SEBELUMNYA: ${bab.nomor_bab}

${cleanText(
  isi.slice(-6500),
  6500
)}
`;
  }

  const systemPrompt = `
Kamu adalah penulis novel profesional Indonesia.

Tugasmu adalah melanjutkan novel secara langsung.

HASIL HARUS BERUPA PROSA NOVEL.

Jangan membuat:
- Markdown
- bullet
- numbering
- outline
- laporan
- penjelasan
- komentar sebagai AI
- rangkuman sebelum cerita

Jangan menulis:
"Berikut adalah bab..."
"Pada bab ini..."
"Bab selanjutnya..."

Langsung mulai dengan cerita.

Gunakan:
- narasi
- dialog
- tindakan
- suasana
- pikiran
- emosi
- konflik
- perkembangan kejadian

Jaga kesinambungan dengan cerita sebelumnya.

Jangan mengulang seluruh kejadian dari bab sebelumnya.

Bab harus memiliki perkembangan cerita yang nyata.

Akhiri bab dengan hook yang membuat pembaca ingin melanjutkan.

Target panjang sekitar 1.800-2.200 kata.

Mode:
${novel.mode || "Normal"}

Genre:
${novel.genre || "-"}

Gaya:
${novel.gaya || "-"}

Nuansa:
${novel.nuansa || "-"}

Jika ada unsur romantis, semua tokoh yang terlibat harus orang dewasa.
`;

  const userPrompt = `
JUDUL NOVEL:
${novel.judul}

PREMIS:
${cleanText(novel.premis, 3000)}

KARAKTER:
${formatKarakter(karakter)}

MEMORY CERITA:
${formatMemory(memory)}

${konteksBabSebelumnya}

Sekarang tulis BAB ${nomorBab}.

Jangan memberikan judul bab terpisah.

Langsung tulis isi novel.

Panjang sekitar 1.800-2.200 kata.
`;

  const hasil = await callGroq(
    [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPrompt
      }
    ],
    env,
    4500
  );

  if (!hasil) {
    throw new Error("AI tidak menghasilkan bab.");
  }

  const jumlahKata =
    hitungKata(hasil);

  const judulBab =
    `Bab ${nomorBab}`;

  const babData = {
    novel_id: novelId,
    user_id: user.id,
    nomor_bab: nomorBab,
    judul_bab: judulBab,
    isi_bab: hasil,
    ringkasan: cleanText(
      hasil.slice(0, 700),
      700
    ),
    jumlah_karakter: hasil.length,
    status: "selesai"
  };

  const insertBab =
    await supabaseUserFetch(
      "novel_bab",
      token,
      env,
      {
        method: "POST",
        headers: {
          "Prefer": "return=representation"
        },
        body: JSON.stringify(
          babData
        )
      }
    );

  if (!insertBab.ok) {
    const err =
      await insertBab.text();

    throw new Error(
      `Gagal menyimpan bab: ${err}`
    );
  }

  const updateNovel =
    await supabaseUserFetch(
      `novel?id=eq.${encodeURIComponent(novelId)}&user_id=eq.${encodeURIComponent(user.id)}`,
      token,
      env,
      {
        method: "PATCH",
        body: JSON.stringify({
          bab_selesai:
            nomorBab,
          updated_at:
            new Date().toISOString()
        })
      }
    );

  if (!updateNovel.ok) {
    console.log(
      "Peringatan: nomor bab novel gagal diperbarui."
    );
  }

  await supabaseUserFetch(
    "penggunaan_ai",
    token,
    env,
    {
      method: "POST",
      body: JSON.stringify({
        user_id: user.id,
        jenis_tulisan:
          "novel_bab",
        jumlah_karakter:
          hasil.length,
        model_ai:
          "openai/gpt-oss-120b",
        status:
          "berhasil"
      })
    }
  );

  return json({
    success: true,
    nomor_bab:
      nomorBab,
    judul_bab:
      judulBab,
    isi_bab:
      hasil,
    jumlah_kata:
      jumlahKata,
    jumlah_karakter:
      hasil.length
  });
}

/* =========================
   UPDATE MEMORY
========================= */

async function updateMemory(
  body,
  user,
  token,
  env
) {
  if (!body.novel_id) {
    throw new Error(
      "ID novel tidak ditemukan."
    );
  }

  const data = {
    novel_id:
      body.novel_id,

    user_id:
      user.id,

    tipe:
      cleanText(
        body.tipe ||
          "alur",
        50
      ),

    judul:
      cleanText(
        body.judul,
        200
      ),

    isi:
      cleanText(
        body.isi,
        3000
      ),

    penting:
      body.penting !== false,

    bab_terkait:
      body.bab_terkait ||
      null,

    updated_at:
      new Date().toISOString()
  };

  const res =
    await supabaseUserFetch(
      "novel_memory",
      token,
      env,
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

  if (!res.ok) {
    const err =
      await res.text();

    throw new Error(
      `Gagal menyimpan memory: ${err}`
    );
  }

  return json({
    success:
      true
  });
}

/* =========================
   HANDLE REQUEST
========================= */

async function handle(
  request,
  env
) {

  /* CORS PREFLIGHT */
  if (
    request.method ===
    "OPTIONS"
  ) {
    return new Response(
      null,
      {
        status: 204,
        headers:
          corsHeaders
      }
    );
  }

  /* TEST BACKEND */
  if (
    request.method ===
    "GET"
  ) {
    return json({
      success:
        true,

      app:
        "PENA AI",

      status:
        "Backend aktif"
    });
  }

  /* ONLY POST */
  if (
    request.method !==
    "POST"
  ) {
    return json(
      {
        success:
          false,

        error:
          "Method tidak didukung."
      },
      405
    );
  }

  /* AUTH */
  const auth =
    request.headers.get(
      "Authorization"
    );

  if (
    !auth ||
    !auth.startsWith(
      "Bearer "
    )
  ) {
    return json(
      {
        success:
          false,

        error:
          "Token login tidak ditemukan."
      },
      401
    );
  }

  const token =
    auth
      .replace(
        "Bearer ",
        ""
      )
      .trim();

  const user =
    await getUser(
      token,
      env
    );

  if (!user) {
    return json(
      {
        success:
          false,

        error:
          "Sesi login tidak valid."
      },
      401
    );
  }

  let body;

  try {
    body =
      await request.json();
  }

  catch {
    return json(
      {
        success:
          false,

        error:
          "JSON request tidak valid."
      },
      400
    );
  }

  try {

    switch (
      body.action
    ) {

      case "write":

        return await tulisCepat(
          body,
          user,
          token,
          env
        );

      case "create_novel":

      case "buat_novel":

        return await buatNovel(
          body,
          user,
          token,
          env
        );

      case "write_chapter":

      case "tulis_bab":

        return await tulisBab(
          body,
          user,
          token,
          env
        );

      case "update_memory":

        return await updateMemory(
          body,
          user,
          token,
          env
        );

      default:

        return json(
          {
            success:
              false,

            error:
              `Action tidak dikenal: ${body.action}`
          },
          400
        );
    }

  }

  catch (error) {

    console.error(
      error
    );

    return json(
      {
        success:
          false,

        error:
          error.message ||
          "Terjadi kesalahan pada server."
      },
      500
    );
  }
}

/* =========================
   CLOUDFLARE WORKER
========================= */

export default {

  async fetch(
    request,
    env
  ) {

    return handle(
      request,
      env
    );
  }

};
