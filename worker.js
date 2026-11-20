/* =====================================================
   PENA AI BACKEND - CLOUDFLARE WORKER
   GROQ + SUPABASE
===================================================== */

const corsHeaders = {
  "Access-Control-Allow-Origin":
    "https://pena-ai-engine.pages.dev",

  "Access-Control-Allow-Headers":
    "Content-Type, Authorization",

  "Access-Control-Allow-Methods":
    "GET, POST, OPTIONS",

  "Access-Control-Max-Age":
    "86400"
};


/* =====================================================
   JSON RESPONSE
===================================================== */

function json(data, status = 200) {

  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        ...corsHeaders
      }
    }
  );
}


/* =====================================================
   WORD COUNT
===================================================== */

function hitungKata(text) {

  if (!text) {
    return 0;
  }

  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}


/* =====================================================
   SUPABASE REQUEST
===================================================== */

async function supabaseUserFetch(
  path,
  token,
  env,
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

  return fetch(
    `${env.SUPABASE_URL}/rest/v1/${path}`,
    {
      ...options,
      headers
    }
  );
}


/* =====================================================
   GET USER
===================================================== */

async function getUser(token, env) {

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
  messages,
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

        body: JSON.stringify({

          model:
            "openai/gpt-oss-120b",

          input:
            messages,

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
    Array.isArray(data.output)
  ) {

    for (
      const item of data.output
    ) {

      if (
        Array.isArray(item.content)
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

  return hasil.trim();
}


/* =====================================================
   INSTRUKSI NOVEL
===================================================== */

const NOVEL_SYSTEM_PROMPT = `
Anda adalah penulis novel profesional berbahasa Indonesia.

Tugas Anda adalah menghasilkan cerita fiksi dalam bentuk prosa novel yang mengalir, hidup, natural, dan enak dibaca.

ATURAN WAJIB:

Tulis hanya cerita.

Jangan menulis penjelasan sebelum cerita.

Jangan menulis penjelasan setelah cerita.

Jangan menampilkan prompt.

Jangan menampilkan instruksi.

Jangan menampilkan aturan.

Jangan menampilkan analisis.

Jangan menampilkan proses berpikir.

Jangan menampilkan catatan teknis.

Jangan mengatakan bahwa Anda adalah AI.

Jangan mengatakan bahwa Anda sedang mengikuti instruksi.

Jangan menggunakan Markdown.

Jangan menggunakan bullet point.

Jangan menggunakan numbering.

Jangan membuat outline.

Jangan membuat ringkasan.

Jangan menggunakan format laporan.

Jangan menulis "Bab 1", "Bab 2", "Chapter 1", atau judul teknis lainnya di dalam hasil, kecuali pengguna secara khusus meminta judul tersebut.

Mulai langsung dari adegan cerita.

Gunakan bahasa Indonesia yang natural dan matang.

Gunakan paragraf novel yang normal.

Gunakan dialog yang natural.

Gunakan suasana tempat.

Gunakan gerakan dan tindakan karakter.

Gunakan pikiran dan emosi karakter.

Gunakan konflik dan perkembangan cerita.

Jangan membuat cerita terasa seperti sinopsis.

Jangan hanya menjelaskan apa yang terjadi.

Perlihatkan kejadian melalui adegan, dialog, tindakan, dan reaksi karakter.

Pertahankan nama, usia, hubungan, karakter, latar belakang, dan fakta penting yang diberikan pengguna.

Jangan mengubah hubungan antar karakter tanpa alasan yang diberikan dalam cerita.

Jika ada karakter dewasa, perlakukan mereka sebagai orang dewasa.

Jika cerita memiliki unsur romantis atau dewasa, tulis secara matang dan tidak vulgar.

Cerita harus terasa seperti karya fiksi yang benar-benar sedang berlangsung.

Setiap paragraf harus mendorong cerita maju.

Jaga kesinambungan karakter dan kejadian.

Akhiri bagian cerita dengan perkembangan, konflik, pertanyaan, atau situasi yang membuat pembaca ingin membaca kelanjutannya.

HASIL AKHIR HARUS LANGSUNG BERUPA CERITA NOVEL BERBAHASA INDONESIA.

Jangan tulis apa pun selain cerita.
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

  const userPrompt = `
Tulis sebuah cerita novel berdasarkan ide berikut:

${prompt}

Judul cerita:
${judul}

Kembangkan menjadi prosa novel yang utuh.

Langsung mulai dari cerita.
`;


  const hasil =
    await callGroq(
      [
        {
          role:
            "system",

          content:
            NOVEL_SYSTEM_PROMPT
        },

        {
          role:
            "user",

          content:
            userPrompt
        }
      ],
      env,
      4000
    );


  /* =================================================
     SIMPAN RIWAYAT
  ================================================= */

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


  /* =================================================
     CATAT PENGGUNAAN AI
  ================================================= */

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

  const judul =
    body.judul ||
    "Novel Baru";

  const genre =
    body.genre ||
    "";

  const gaya =
    body.gaya ||
    "";

  const nuansa =
    body.nuansa ||
    "";

  const mode =
    body.mode ||
    "";

  const premis =
    body.premis ||
    "";

  const targetBab =
    Number(
      body.target_bab ||
      10
    );


  const insertData = {

    user_id:
      user.id,

    judul:
      judul,

    genre:
      genre,

    gaya:
      gaya,

    nuansa:
      nuansa,

    mode:
      mode,

    premis:
      premis,

    target_bab:
      targetBab,

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
            insertData
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
      Array.isArray(data)
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

  const novelId =
    body.novel_id;


  const response =
    await supabaseUserFetch(
      "novel_karakter?select=*&novel_id=eq." +
      encodeURIComponent(
        novelId
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

  const novelId =
    body.novel_id;


  const response =
    await supabaseUserFetch(
      "novel_memory?select=*&novel_id=eq." +
      encodeURIComponent(
        novelId
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

  const novelId =
    body.novel_id;


  const response =
    await supabaseUserFetch(
      "novel_bab?select=*&novel_id=eq." +
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
      Array.isArray(data)
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


  if (!novelId) {

    throw new Error(
      "ID novel tidak ditemukan."
    );
  }


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

    const karakterResponse =
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


    const karakterData =
      await karakterResponse.json();


    if (
      Array.isArray(
        karakterData
      )
    ) {

      karakterText =
        karakterData
          .map(
            k =>
              `${k.nama || ""}, usia ${k.umur || ""}, ${k.peran || ""}. Sifat: ${k.sifat || ""}. Latar: ${k.latar_belakang || ""}. Hubungan: ${k.hubungan || ""}. Tujuan: ${k.tujuan || ""}.`
          )
          .join("\n");
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

    const memoryResponse =
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


    const memoryData =
      await memoryResponse.json();


    if (
      Array.isArray(
        memoryData
      )
    ) {

      memoryText =
        memoryData
          .map(
            m =>
              `[${m.tipe || ""}] ${m.judul || ""}: ${m.isi || ""}`
          )
          .join("\n");
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

    const previousResponse =
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


    const previousData =
      await previousResponse.json();


    if (
      Array.isArray(
        previousData
      ) &&
      previousData.length
    ) {

      const last =
        previousData[0];

      babTerakhir =
        `
BAB SEBELUMNYA:

Judul:
${last.judul_bab || ""}

Isi:
${(last.isi_bab || "")
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
Tulis lanjutan cerita novel untuk bagian ${nomorBab}.

Judul bagian:
${judulBab}

Konteks cerita:
${konteks}

Karakter:
${karakterText}

Memory cerita:
${memoryText}

${babTerakhir}

Tulis lanjutan cerita yang benar-benar menyambung dengan kejadian sebelumnya.

Panjang target sekitar 1.800 sampai 2.200 kata.

Jangan membuat ringkasan.

Jangan membuat outline.

Jangan menulis instruksi.

Jangan menulis penjelasan.

Jangan menulis kata "Bab" sebagai pembuka.

Langsung tulis prosa novel dalam bahasa Indonesia.
`;


  const hasil =
    await callGroq(
      [
        {
          role:
            "system",

          content:
            NOVEL_SYSTEM_PROMPT
        },

        {
          role:
            "user",

          content:
            chapterPrompt
        }
      ],
      env,
      5000
    );


  const insertResponse =
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


  const savedData =
    await insertResponse.json();


  if (!insertResponse.ok) {

    throw new Error(
      savedData?.message ||
      "Tulisan berhasil dibuat tetapi gagal disimpan ke database."
    );
  }


  /* UPDATE JUMLAH BAB */

  try {

    await supabaseUserFetch(
      `novel?id=eq.${encodeURIComponent(
        novelId
      )}&user_id=eq.${encodeURIComponent(
        user.id
      )}`,
      token,
      env,
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
              nomorBab
          })
      }
    );

  } catch (error) {

    console.log(
      "Gagal update jumlah bab:",
      error.message
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
      "Data memory kosong."
    );
  }


  const data =
    {
      ...memory,

      user_id:
        user.id
    };


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
          JSON.stringify(
            data
          )
      }
    );


  const result =
    await response.json();


  if (!response.ok) {

    throw new Error(
      result?.message ||
      "Gagal menyimpan memory."
    );
  }


  return {
    success:
      true,

    memory:
      Array.isArray(
        result
      )
        ? result[0]
        : result
  };
}


/* =====================================================
   MAIN HANDLER
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
      authHeader
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
            "Sesi login tidak valid. Silakan login kembali."
        },
        401
      );
    }


    const body =
      await request.json();


    const action =
      body.action;


    let result;


    switch (
      action
    ) {

      case "write":

        result =
          await tulisCepat(
            body,
            user,
            token,
            env
          );

        break;


      case "buat_novel":

        result =
          await buatNovel(
            body,
            user,
            token,
            env
          );

        break;


      case "ambil_novel":

        result =
          await ambilNovel(
            user,
            token,
            env
          );

        break;


      case "ambil_karakter":

        result =
          await ambilKarakter(
            body,
            user,
            token,
            env
          );

        break;


      case "ambil_memory":

        result =
          await ambilMemory(
            body,
            user,
            token,
            env
          );

        break;


      case "ambil_bab_terakhir":

        result =
          await ambilBabTerakhir(
            body,
            user,
            token,
            env
          );

        break;


      case "tulis_bab":

        result =
          await tulisBab(
            body,
            user,
            token,
            env
          );

        break;


      case "update_memory":

        result =
          await updateMemory(
            body,
            user,
            token,
            env
          );

        break;


      default:

        return json(
          {
            success:
              false,

            error:
              `Action "${action}" tidak dikenali.`
          },
          400
        );
    }


    return json(
      result
    );

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
   CLOUDFLARE WORKER
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
