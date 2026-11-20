const corsHeaders = {
  "Access-Control-Allow-Origin": "https://pena-ai-engine.pages.dev",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
};


/* =====================================================
   RESPONSE JSON
===================================================== */

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...corsHeaders
      }
    }
  );
}


/* =====================================================
   HITUNG KATA
===================================================== */

function hitungKata(text) {
  if (!text) return 0;

  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}


/* =====================================================
   BERSIHKAN HASIL AI
===================================================== */

function bersihkanHasilAI(text) {

  if (!text) {
    return "";
  }

  let hasil =
    String(text).trim();


  /*
   * Buang blok instruksi bahasa Inggris
   * jika model masih mengeluarkannya.
   */

  const polaAwal = [
    /^We need to write[\s\S]*?Let's write\.?/i,
    /^We need to write[\s\S]*?Let's produce\.?/i,
    /^We need to write[\s\S]*?Let's craft[\s\S]*?\./i,
    /^Let's write[\s\S]*?\.\s*/i,
    /^Let's produce[\s\S]*?\.\s*/i,
    /^Let's craft[\s\S]*?\.\s*/i,
    /^We need[\s\S]*?story\.\s*/i
  ];


  for (
    const pola of polaAwal
  ) {

    hasil =
      hasil.replace(
        pola,
        ""
      );
  }


  /*
   * Jika model mengeluarkan kalimat
   * instruksi tepat sebelum cerita,
   * potong berdasarkan penanda umum.
   */

  const penandaCerita = [
    "Arif ",
    "Aku ",
    "Ia ",
    "Dia ",
    "Pagi itu",
    "Malam itu",
    "Sore itu",
    "Ketika ",
    "Saat ",
    "Hari itu",
    "Di pagi",
    "Di malam",
    "Di sore",
    "Dari kejauhan",
    "Rumah itu",
    "Langit "
  ];


  let posisiCerita = -1;


  for (
    const penanda of penandaCerita
  ) {

    const posisi =
      hasil.indexOf(
        penanda
      );

    if (
      posisi !== -1 &&
      (
        posisiCerita === -1 ||
        posisi < posisiCerita
      )
    ) {

      posisiCerita =
        posisi;
    }
  }


  /*
   * Jangan potong kalau cerita memang
   * sudah dimulai dari awal.
   */

  if (
    posisiCerita > 80
  ) {

    hasil =
      hasil.substring(
        posisiCerita
      );
  }


  /*
   * Bersihkan kalimat teknis
   * yang mungkin tersisa di awal.
   */

  hasil =
    hasil.replace(
      /^(Here is|Here’s|Below is|Sure,|Certainly,|Of course,|Berikut adalah|Berikut cerita|Berikut kisah)[\s\S]*?:\s*/i,
      ""
    );


  return hasil.trim();
}


/* =====================================================
   SUPABASE FETCH
===================================================== */

async function supabaseUserFetch(
  path,
  token,
  env,
  options = {}
) {

  return fetch(
    `${env.SUPABASE_URL}/rest/v1/${path}`,
    {
      ...options,

      headers: {
        "apikey":
          env.SUPABASE_ANON_KEY,

        "Authorization":
          `Bearer ${token}`,

        "Content-Type":
          "application/json",

        ...(options.headers || {})
      }
    }
  );
}


/* =====================================================
   GET USER
===================================================== */

async function getUser(
  token,
  env
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

  return response.json();
}


/* =====================================================
   GROQ
===================================================== */

async function callGroq(
  systemPrompt,
  userPrompt,
  env,
  maxOutputTokens = 4000
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

        body:
          JSON.stringify({

            model:
              "openai/gpt-oss-120b",

            input: [
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

            max_output_tokens:
              maxOutputTokens,

            temperature:
              0.85
          })
      }
    );


  const data =
    await response.json();


  if (!response.ok) {

    throw new Error(
      data?.error?.message ||
      "Groq gagal memproses tulisan."
    );
  }


  let hasil = "";


  if (
    typeof data.output_text ===
    "string"
  ) {

    hasil =
      data.output_text;

  } else if (
    Array.isArray(
      data.output
    )
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
          const content
          of item.content
        ) {

          if (
            typeof content.text ===
            "string"
          ) {

            hasil +=
              content.text;
          }
        }
      }
    }
  }


  if (!hasil.trim()) {

    throw new Error(
      "AI tidak menghasilkan tulisan."
    );
  }


  return bersihkanHasilAI(
    hasil
  );
}


/* =====================================================
   SISTEM NOVEL
===================================================== */

const NOVEL_SYSTEM_PROMPT = `
Anda adalah mesin penulis novel berbahasa Indonesia.

Tugas Anda hanya satu:
MENULIS CERITA.

Output Anda akan langsung ditampilkan kepada pembaca.

Karena itu, JANGAN PERNAH menampilkan instruksi internal, aturan, prompt, analisis, catatan, penjelasan teknis, atau proses berpikir.

Jangan menulis kalimat seperti:
"We need to write..."
"Let's write..."
"Let's craft..."
"Let's produce..."
"Here is the story..."
"Below is the story..."
"Berikut adalah cerita..."

Jangan menjelaskan apa yang Anda lakukan.

Jangan menjelaskan bagaimana cerita dibuat.

Jangan mengulang permintaan pengguna.

Jangan menampilkan daftar aturan.

Jangan menampilkan Markdown.

Jangan menggunakan bullet point.

Jangan menggunakan numbering.

Jangan membuat outline.

Jangan membuat sinopsis.

Jangan membuat laporan.

Jangan menggunakan format instruksi.

Jangan menulis "Bab" sebagai pembuka.

Mulailah langsung dengan adegan cerita.

Gunakan bahasa Indonesia.

Gunakan gaya prosa novel yang alami.

Gunakan paragraf yang mengalir.

Gunakan dialog.

Gunakan suasana.

Gunakan tindakan.

Gunakan pikiran tokoh.

Gunakan emosi.

Gunakan konflik.

Gunakan perkembangan karakter.

Jangan hanya merangkum kejadian.

Tunjukkan kejadian melalui adegan dan tindakan.

Pertahankan nama, usia, hubungan, dan fakta karakter yang diberikan pengguna.

Jika terdapat karakter dewasa, perlakukan sebagai karakter dewasa.

Jika ada unsur romantis, gunakan pendekatan dewasa dan tidak vulgar.

Hasil akhir harus langsung berupa cerita.

Tidak boleh ada teks lain sebelum atau sesudah cerita.
`;


/* =====================================================
   TULIS CEPAT
===================================================== */

async function tulisCepat(
  body,
  user,
  token,
  env
) {

  const judul =
    body.judul ||
    "Tulisan Baru";


  const prompt =
    body.prompt ||
    "";


  if (!prompt.trim()) {

    throw new Error(
      "Prompt tulisan kosong."
    );
  }


  /*
   * PERHATIKAN:
   * Yang dikirim sebagai prompt user
   * hanya permintaan cerita.
   */

  const userPrompt = `
Tulis cerita novel berdasarkan ide berikut.

Judul:
${judul}

Ide cerita:
${prompt}

Tulis langsung cerita tersebut.
Mulai dari adegan pertama.
Gunakan prosa novel berbahasa Indonesia.
`;


  const hasil =
    await callGroq(
      NOVEL_SYSTEM_PROMPT,
      userPrompt,
      env,
      4000
    );


  if (!hasil.trim()) {

    throw new Error(
      "Hasil cerita kosong."
    );
  }


  /*
   * SIMPAN RIWAYAT
   */

  try {

    await supabaseUserFetch(
      "riwayat_penulisan",
      token,
      env,
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
              judul,

            prompt:
              prompt,

            hasil_tulisan:
              hasil,

            jumlah_kata:
              hitungKata(
                hasil
              )
          })
      }
    );

  } catch (error) {

    console.log(
      "Gagal menyimpan riwayat:",
      error.message
    );
  }


  /*
   * CATAT PENGGUNAAN AI
   */

  try {

    await supabaseUserFetch(
      "penggunaan_ai",
      token,
      env,
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

            jenis:
              "tulis_cepat",

            model:
              "openai/gpt-oss-120b",

            jumlah_kata:
              hitungKata(
                hasil
              )
          })
      }
    );

  } catch (error) {

    console.log(
      "Gagal mencatat penggunaan AI:",
      error.message
    );
  }


  return {

    success:
      true,

    hasil_tulisan:
      hasil,

    jumlah_kata:
      hitungKata(
        hasil
      ),

    model_ai:
      "openai/gpt-oss-120b"
  };
}


/* =====================================================
   BUAT NOVEL
===================================================== */

async function buatNovel(
  body,
  user,
  token,
  env
) {

  const dataNovel = {

    user_id:
      user.id,

    judul:
      body.judul ||
      "Novel Baru",

    genre:
      body.genre ||
      "",

    gaya:
      body.gaya ||
      "",

    nuansa:
      body.nuansa ||
      "",

    mode:
      body.mode ||
      "",

    premis:
      body.premis ||
      "",

    target_bab:
      Number(
        body.target_bab ||
        10
      ),

    bab_selesai:
      0,

    status:
      "aktif"
  };


  const response =
    await supabaseUserFetch(
      "novel",
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
            dataNovel
          )
      }
    );


  const data =
    await response.json();


  if (!response.ok) {

    throw new Error(
      data?.message ||
      "Gagal membuat novel."
    );
  }


  return {

    success:
      true,

    novel:
      Array.isArray(
        data
      )
        ? data[0]
        : data
  };
}


/* =====================================================
   AMBIL NOVEL
===================================================== */

async function ambilNovel(
  user,
  token,
  env
) {

  const response =
    await supabaseUserFetch(
      "novel?select=*&user_id=eq." +
      encodeURIComponent(
        user.id
      ) +
      "&order=created_at.desc",
      token,
      env
    );


  const data =
    await response.json();


  if (!response.ok) {

    throw new Error(
      data?.message ||
      "Gagal mengambil novel."
    );
  }


  return {

    success:
      true,

    novels:
      data
  };
}


/* =====================================================
   AMBIL KARAKTER
===================================================== */

async function ambilKarakter(
  body,
  user,
  token,
  env
) {

  const response =
    await supabaseUserFetch(
      "novel_karakter?select=*&novel_id=eq." +
      encodeURIComponent(
        body.novel_id
      ) +
      "&user_id=eq." +
      encodeURIComponent(
        user.id
      ) +
      "&order=created_at.asc",
      token,
      env
    );


  const data =
    await response.json();


  if (!response.ok) {

    throw new Error(
      data?.message ||
      "Gagal mengambil karakter."
    );
  }


  return {

    success:
      true,

    karakter:
      data
  };
}


/* =====================================================
   AMBIL MEMORY
===================================================== */

async function ambilMemory(
  body,
  user,
  token,
  env
) {

  const response =
    await supabaseUserFetch(
      "novel_memory?select=*&novel_id=eq." +
      encodeURIComponent(
        body.novel_id
      ) +
      "&user_id=eq." +
      encodeURIComponent(
        user.id
      ) +
      "&order=created_at.desc",
      token,
      env
    );


  const data =
    await response.json();


  if (!response.ok) {

    throw new Error(
      data?.message ||
      "Gagal mengambil memory."
    );
  }


  return {

    success:
      true,

    memory:
      data
  };
}


/* =====================================================
   AMBIL BAB TERAKHIR
===================================================== */

async function ambilBabTerakhir(
  body,
  user,
  token,
  env
) {

  const response =
    await supabaseUserFetch(
      "novel_bab?select=*&novel_id=eq." +
      encodeURIComponent(
        body.novel_id
      ) +
      "&user_id=eq." +
      encodeURIComponent(
        user.id
      ) +
      "&order=nomor_bab.desc&limit=1",
      token,
      env
    );


  const data =
    await response.json();


  if (!response.ok) {

    throw new Error(
      data?.message ||
      "Gagal mengambil bab."
    );
  }


  return {

    success:
      true,

    bab:
      Array.isArray(
        data
      )
        ? data[0] ||
          null
        : null
  };
}


/* =====================================================
   TULIS BAB
===================================================== */

async function tulisBab(
  body,
  user,
  token,
  env
) {

  const novelId =
    body.novel_id;


  const nomorBab =
    Number(
      body.nomor_bab ||
      1
    );


  const judulBab =
    body.judul_bab ||
    `Bagian ${nomorBab}`;


  const konteks =
    body.konteks ||
    "";


  let karakterText =
    "";


  try {

    const response =
      await supabaseUserFetch(
        "novel_karakter?select=nama,umur,jenis_kelamin,peran,sifat,latar_belakang,hubungan,tujuan,rahasia,catatan&novel_id=eq." +
        encodeURIComponent(
          novelId
        ) +
        "&user_id=eq." +
        encodeURIComponent(
          user.id
        ),
        token,
        env
      );


    const data =
      await response.json();


    if (
      Array.isArray(
        data
      )
    ) {

      karakterText =
        data.map(
          k =>
            `${k.nama || ""}, usia ${k.umur || ""}, ${k.peran || ""}. Sifat: ${k.sifat || ""}. Latar: ${k.latar_belakang || ""}. Hubungan: ${k.hubungan || ""}. Tujuan: ${k.tujuan || ""}.`
        ).join("\n");
    }

  } catch (error) {

    console.log(
      "Karakter tidak tersedia:",
      error.message
    );
  }


  let memoryText =
    "";


  try {

    const response =
      await supabaseUserFetch(
        "novel_memory?select=tipe,judul,isi,penting,bab_terkait&novel_id=eq." +
        encodeURIComponent(
          novelId
        ) +
        "&user_id=eq." +
        encodeURIComponent(
          user.id
        ) +
        "&order=created_at.desc&limit=10",
        token,
        env
      );


    const data =
      await response.json();


    if (
      Array.isArray(
        data
      )
    ) {

      memoryText =
        data.map(
          m =>
            `[${m.tipe || ""}] ${m.judul || ""}: ${m.isi || ""}`
        ).join("\n");
    }

  } catch (error) {

    console.log(
      "Memory tidak tersedia:",
      error.message
    );
  }


  let babTerakhir =
    "";


  try {

    const response =
      await supabaseUserFetch(
        "novel_bab?select=judul_bab,isi_bab,nomor_bab&novel_id=eq." +
        encodeURIComponent(
          novelId
        ) +
        "&user_id=eq." +
        encodeURIComponent(
          user.id
        ) +
        "&order=nomor_bab.desc&limit=1",
        token,
        env
      );


    const data =
      await response.json();


    if (
      Array.isArray(
        data
      ) &&
      data.length
    ) {

      const bab =
        data[0];


      babTerakhir =
        `
Konteks bagian sebelumnya:

${(bab.isi_bab || "")
  .slice(-6500)}
`;
    }

  } catch (error) {

    console.log(
      "Bab sebelumnya tidak tersedia:",
      error.message
    );
  }


  const chapterPrompt = `
Tulis lanjutan cerita novel.

Bagian:
${nomorBab}

Judul:
${judulBab}

Konteks:
${konteks}

Karakter:
${karakterText}

Memory:
${memoryText}

${babTerakhir}

Lanjutkan cerita secara natural.

Target panjang sekitar 1.800 sampai 2.200 kata.

Langsung tulis cerita.
`;


  const hasil =
    await callGroq(
      NOVEL_SYSTEM_PROMPT,
      chapterPrompt,
      env,
      5000
    );


  const response =
    await supabaseUserFetch(
      "novel_bab",
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
          JSON.stringify({

            novel_id:
              novelId,

            user_id:
              user.id,

            nomor_bab:
              nomorBab,

            judul_bab:
              judulBab,

            isi_bab:
              hasil,

            ringkasan:
              "",

            jumlah_karakter:
              hasil.length,

            status:
              "selesai"
          })
      }
    );


  const saved =
    await response.json();


  if (!response.ok) {

    throw new Error(
      saved?.message ||
      "Gagal menyimpan bab."
    );
  }


  return {

    success:
      true,

    hasil_tulisan:
      hasil,

    nomor_bab:
      nomorBab,

    judul_bab:
      judulBab,

    jumlah_kata:
      hitungKata(
        hasil
      )
  };
}


/* =====================================================
   UPDATE MEMORY
===================================================== */

async function updateMemory(
  body,
  user,
  token,
  env
) {

  const memory =
    body.memory;


  if (!memory) {

    throw new Error(
      "Memory kosong."
    );
  }


  const response =
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
          JSON.stringify({

            ...memory,

            user_id:
              user.id
          })
      }
    );


  const data =
    await response.json();


  if (!response.ok) {

    throw new Error(
      data?.message ||
      "Gagal menyimpan memory."
    );
  }


  return {

    success:
      true,

    memory:
      Array.isArray(
        data
      )
        ? data[0]
        : data
  };
}


/* =====================================================
   HANDLE REQUEST
===================================================== */

async function handle(
  request,
  env
) {

  if (
    request.method ===
    "OPTIONS"
  ) {

    return new Response(
      null,
      {
        status:
          204,

        headers:
          corsHeaders
      }
    );
  }


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


  try {

    const authorization =
      request.headers.get(
        "Authorization"
      );


    if (
      !authorization ||
      !authorization.startsWith(
        "Bearer "
      )
    ) {

      return json(
        {
          success:
            false,

          error:
            "Authorization tidak ditemukan."
        },
        401
      );
    }


    const token =
      authorization
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


    const body =
      await request.json();


    switch (
      body.action
    ) {

      case "write":

        return json(
          await tulisCepat(
            body,
            user,
            token,
            env
          )
        );


      case "buat_novel":

        return json(
          await buatNovel(
            body,
            user,
            token,
            env
          )
        );


      case "ambil_novel":

        return json(
          await ambilNovel(
            user,
            token,
            env
          )
        );


      case "ambil_karakter":

        return json(
          await ambilKarakter(
            body,
            user,
            token,
            env
          )
        );


      case "ambil_memory":

        return json(
          await ambilMemory(
            body,
            user,
            token,
            env
          )
        );


      case "ambil_bab_terakhir":

        return json(
          await ambilBabTerakhir(
            body,
            user,
            token,
            env
          )
        );


      case "tulis_bab":

        return json(
          await tulisBab(
            body,
            user,
            token,
            env
          )
        );


      case "update_memory":

        return json(
          await updateMemory(
            body,
            user,
            token,
            env
          )
        );


      default:

        return json(
          {
            success:
              false,

            error:
              `Action "${body.action}" tidak dikenali.`
          },
          400
        );
    }

  } catch (error) {

    console.error(
      "PENA AI ERROR:",
      error
    );


    return json(
      {
        success:
          false,

        error:
          error.message ||
          "Terjadi kesalahan pada backend."
      },
      500
    );
  }
}


/* =====================================================
   CLOUDFLARE
===================================================== */

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
