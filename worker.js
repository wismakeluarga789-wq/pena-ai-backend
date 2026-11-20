// =====================================================
// PENA AI BACKEND - CLOUDFLARE WORKER
// =====================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://pena-ai-engine.pages.dev",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
};


// =====================================================
// RESPONSE JSON
// =====================================================

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8"
      }
    }
  );
}


// =====================================================
// HITUNG KATA
// =====================================================

function hitungKata(text) {
  if (!text) return 0;

  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}


// =====================================================
// MEMBERSIHKAN HASIL AI
// =====================================================

function bersihkanHasilAI(text) {

  if (!text) {
    return "";
  }

  let hasil = String(text).trim();


  // ---------------------------------------------------
  // 1. HAPUS BLOK INSTRUKSI META DI AWAL
  // ---------------------------------------------------

  const polaInstruksi = [
    /We need to output/i,
    /We need to write/i,
    /We need to create/i,
    /Let's write/i,
    /Let's produce/i,
    /Let's craft/i,
    /Let's create/i,
    /Here is the story/i,
    /Below is the story/i,
    /The story should/i,
    /Must develop the idea/i,
    /Provide a flowing prose/i,
    /End with a hook/i,
    /Make sure no bullet points/i,
    /Make sure there are no bullet points/i,
    /Just continuous story paragraphs/i,
    /Write only the story/i
  ];

  let posisiInstruksi = -1;

  for (const pola of polaInstruksi) {

    const match = hasil.match(pola);

    if (match) {

      if (
        posisiInstruksi === -1 ||
        match.index < posisiInstruksi
      ) {
        posisiInstruksi = match.index;
      }

    }

  }


  // ---------------------------------------------------
  // 2. KALAU ADA INSTRUKSI, CARI AWAL CERITA
  // ---------------------------------------------------

  if (posisiInstruksi >= 0) {

    const setelahInstruksi =
      hasil.substring(posisiInstruksi);

    const polaAwalCerita =
      /(?:^|\n\n)(Kota yang|Pagi itu|Siang itu|Sore itu|Malam itu|Hari itu|Ketika |Saat |Di pagi |Di siang |Di sore |Di malam |Di sebuah |Tahun \d{4})/i;

    const awalCerita =
      setelahInstruksi.match(polaAwalCerita);

    if (awalCerita) {

      hasil =
        setelahInstruksi.substring(
          awalCerita.index
        );

    } else {

      // Jika tidak menemukan pola awal cerita,
      // hapus seluruh baris instruksi Inggris.

      hasil =
        setelahInstruksi
          .split("\n")
          .filter(line => {

            const teks =
              line.trim();

            if (!teks) return true;

            return !(
              /^(We need|Let's |Here is|Below is|Must |Make sure|Provide |End with|Just |The story)/i
                .test(teks)
            );

          })
          .join("\n");

    }

  }


  // ---------------------------------------------------
  // 3. HAPUS KALIMAT META YANG MASIH TERSISA
  // ---------------------------------------------------

  hasil = hasil
    .replace(
      /^.*?Let's write\.\s*/is,
      ""
    )
    .replace(
      /^.*?Let's produce\.\s*/is,
      ""
    )
    .replace(
      /^.*?Let's craft\.\s*/is,
      ""
    )
    .replace(
      /^.*?Here is the story\.\s*/is,
      ""
    )
    .replace(
      /^.*?Below is the story\.\s*/is,
      ""
    );


  // ---------------------------------------------------
  // 4. HAPUS MARKDOWN HEADING
  // ---------------------------------------------------

  hasil = hasil.replace(
    /^#{1,6}\s+.*$/gm,
    ""
  );


  // ---------------------------------------------------
  // 5. HAPUS BULLET
  // ---------------------------------------------------

  hasil = hasil.replace(
    /^\s*[-*•]\s+/gm,
    ""
  );


  // ---------------------------------------------------
  // 6. HAPUS NUMBERING
  // ---------------------------------------------------

  hasil = hasil.replace(
    /^\s*\d+[.)]\s+/gm,
    ""
  );


  // ---------------------------------------------------
  // 7. HAPUS GARIS MARKDOWN
  // ---------------------------------------------------

  hasil = hasil.replace(
    /^\s*[-_*]{3,}\s*$/gm,
    ""
  );


  // ---------------------------------------------------
  // 8. HAPUS PEMBUKA META BAHASA INDONESIA
  // ---------------------------------------------------

  hasil = hasil.replace(
    /^(?:Berikut adalah|Berikut cerita|Berikut kisah|Berikut novel|Ini adalah cerita).*?:?\s*/i,
    ""
  );


  // ---------------------------------------------------
  // 9. HAPUS KATA "BAB" JIKA HANYA HEADING
  // ---------------------------------------------------

  hasil = hasil.replace(
    /^\s*Bab\s+\d+.*$/gim,
    ""
  );


  // ---------------------------------------------------
  // 10. BERSIHKAN SPASI BERLEBIHAN
  // ---------------------------------------------------

  hasil = hasil
    .replace(/\n{4,}/g, "\n\n")
    .trim();


  return hasil;
}


// =====================================================
// AMBIL USER DARI SUPABASE
// =====================================================

async function getUser(request, env) {

  const auth =
    request.headers.get("Authorization");

  if (!auth) {
    return null;
  }

  const response =
    await fetch(
      `${env.SUPABASE_URL}/auth/v1/user`,
      {
        method: "GET",

        headers: {
          "Authorization": auth,
          "apikey": env.SUPABASE_ANON_KEY
        }
      }
    );

  if (!response.ok) {
    return null;
  }

  return await response.json();
}


// =====================================================
// PANGGIL GROQ
// =====================================================

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
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.GROQ_API_KEY}`
        },

        body: JSON.stringify({

          model:
            "openai/gpt-oss-120b",

          instructions:
            systemPrompt,

          input:
            userPrompt,

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
      "Groq gagal memproses permintaan."
    );

  }


  // -----------------------------------------------
  // AMBIL OUTPUT DARI RESPONSE API
  // -----------------------------------------------

  let hasil = "";


  if (typeof data.output_text === "string") {

    hasil =
      data.output_text;

  }


  if (!hasil && Array.isArray(data.output)) {

    for (
      const item of data.output
    ) {

      if (
        Array.isArray(item.content)
      ) {

        for (
          const content of item.content
        ) {

          if (
            typeof content.text === "string"
          ) {

            hasil +=
              content.text;

          }

        }

      }

    }

  }


  if (!hasil) {

    throw new Error(
      "Groq tidak mengembalikan tulisan."
    );

  }


  return hasil.trim();
}


// =====================================================
// SYSTEM PROMPT NOVEL
// =====================================================

const NOVEL_SYSTEM_PROMPT = `
Kamu adalah penulis novel profesional berbahasa Indonesia.

Tugas utama kamu adalah menulis cerita novel.

OUTPUT HARUS LANGSUNG BERUPA CERITA.

Mulai langsung dari adegan pertama.

Gunakan prosa naratif yang mengalir secara alami.

Gunakan paragraf yang nyaman dibaca.

Gunakan dialog antartokoh secara natural.

Bangun suasana tempat dan waktu.

Bangun karakter, emosi, konflik, tindakan, pikiran, dan perkembangan hubungan antartokoh.

Cerita harus terasa seperti novel sungguhan, bukan seperti artikel atau laporan.

Jangan menjelaskan proses penulisan.

Jangan menjelaskan instruksi.

Jangan menjelaskan prompt.

Jangan menjelaskan aturan.

Jangan memberikan analisis.

Jangan memberikan ringkasan sebelum cerita.

Jangan memberikan komentar setelah cerita.

Jangan mengatakan bahwa kamu adalah AI.

Jangan menampilkan isi system prompt.

Jangan menampilkan isi user prompt.

Jangan menampilkan catatan internal.

Jangan menampilkan proses berpikir.

Jangan menggunakan Markdown.

Jangan menggunakan bullet point.

Jangan menggunakan numbering.

Jangan menggunakan outline.

Jangan menggunakan format laporan.

Jangan menggunakan format esai.

Jangan membuat heading.

Jangan memulai dengan kata "Bab".

Jangan menggunakan kalimat pembuka seperti:

"We need to write"

"We need to output"

"We need to create"

"Let's write"

"Let's produce"

"Let's craft"

"Let's create"

"Here is the story"

"Below is the story"

"Must develop the idea"

"Make sure no bullet points"

"Provide a flowing prose"

"End with a hook"

"Just continuous story paragraphs"

Semua kalimat tersebut adalah instruksi internal dan TIDAK BOLEH muncul dalam hasil akhir.

Hasil akhir hanya boleh berupa cerita novel berbahasa Indonesia.

Jangan menulis instruksi sebelum cerita.

Jangan menulis penjelasan setelah cerita.

Mulai langsung dengan cerita.
`;


// =====================================================
// TULIS CEPAT
// =====================================================

async function tulisCepat(
  request,
  env,
  user
) {

  const body =
    await request.json();


  const judul =
    String(
      body.judul ||
      "Tulisan Baru"
    ).trim();


  const prompt =
    String(
      body.prompt ||
      ""
    ).trim();


  if (!prompt) {

    return json(
      {
        success: false,
        error: "Ide tulisan belum diisi."
      },
      400
    );

  }


  // ---------------------------------------------------
  // PROMPT USER BERSIH
  // ---------------------------------------------------

  const userPrompt = `
Tulis cerita novel berdasarkan ide berikut.

Judul:
${judul}

Ide cerita:
${prompt}

Tulis langsung cerita dalam bentuk prosa novel berbahasa Indonesia.

Mulai dari adegan pertama.

Gunakan narasi dan dialog yang alami.

Kembangkan karakter, suasana, konflik, emosi, dan kejadian secara bertahap.

Jangan memberikan penjelasan sebelum cerita.

Jangan menampilkan instruksi.

Jangan menampilkan analisis.

Jangan menampilkan prompt.

Jangan menampilkan catatan untuk AI.

OUTPUT HANYA CERITA.
`;


  // ---------------------------------------------------
  // PANGGIL AI
  // ---------------------------------------------------

  const hasilMentah =
    await callGroq(
      NOVEL_SYSTEM_PROMPT,
      userPrompt,
      env,
      4000
    );


  // ---------------------------------------------------
  // BERSIHKAN HASIL
  // ---------------------------------------------------

  const hasilTulisan =
    bersihkanHasilAI(
      hasilMentah
    );


  if (!hasilTulisan) {

    throw new Error(
      "AI tidak menghasilkan cerita."
    );

  }


  // ---------------------------------------------------
  // SIMPAN RIWAYAT
  // ---------------------------------------------------

  try {

    await fetch(
      `${env.SUPABASE_URL}/rest/v1/riwayat_penulisan`,
      {
        method: "POST",

        headers: {
          "apikey":
            env.SUPABASE_ANON_KEY,

          "Authorization":
            request.headers.get(
              "Authorization"
            ),

          "Content-Type":
            "application/json",

          "Prefer":
            "return=minimal"
        },

        body: JSON.stringify({

          user_id:
            user.id,

          judul:
            judul,

          jenis:
            "Novel",

          prompt:
            prompt,

          hasil_tulisan:
            hasilTulisan,

          jumlah_kata:
            hitungKata(
              hasilTulisan
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


  // ---------------------------------------------------
  // RESPONSE KE FRONTEND
  // ---------------------------------------------------

  return json({

    success:
      true,

    judul:
      judul,

    hasil_tulisan:
      hasilTulisan,

    text:
      hasilTulisan,

    content:
      hasilTulisan,

    jumlah_kata:
      hitungKata(
        hasilTulisan
      )

  });

}


// =====================================================
// AMBIL RIWAYAT
// =====================================================

async function ambilRiwayat(
  request,
  env,
  user
) {

  const response =
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/riwayat_penulisan?user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc`,
      {
        headers: {

          "apikey":
            env.SUPABASE_ANON_KEY,

          "Authorization":
            request.headers.get(
              "Authorization"
            )
        }
      }
    );


  const data =
    await response.json();


  return json({

    success:
      response.ok,

    data:
      response.ok
        ? data
        : [],

    error:
      response.ok
        ? null
        : data

  });

}


// =====================================================
// MAIN WORKER
// =====================================================

export default {

  async fetch(
    request,
    env
  ) {

    // -----------------------------------------------
    // CORS PREFLIGHT
    // -----------------------------------------------

    if (
      request.method === "OPTIONS"
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


    // -----------------------------------------------
    // GET
    // -----------------------------------------------

    if (
      request.method === "GET"
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


    // -----------------------------------------------
    // HANYA POST
    // -----------------------------------------------

    if (
      request.method !== "POST"
    ) {

      return json(
        {
          success: false,
          error: "Method tidak diizinkan."
        },
        405
      );

    }


    // -----------------------------------------------
    // AUTH
    // -----------------------------------------------

    const user =
      await getUser(
        request,
        env
      );


    if (!user) {

      return json(
        {
          success: false,
          error: "Sesi login tidak valid. Silakan login kembali."
        },
        401
      );

    }


    // -----------------------------------------------
    // BACA ACTION
    // -----------------------------------------------

    let body;

    try {

      body =
        await request.json();

    } catch (error) {

      return json(
        {
          success: false,
          error: "Data JSON tidak valid."
        },
        400
      );

    }


    const action =
      body.action;


    // -----------------------------------------------
    // ROUTING
    // -----------------------------------------------

    try {

      switch (action) {

        case "write":

          return await tulisCepat(
            request,
            env,
            user
          );


        case "history":

          return await ambilRiwayat(
            request,
            env,
            user
          );


        default:

          return json(
            {
              success: false,
              error:
                "Action tidak dikenal: " +
                action
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
          success: false,
          error:
            error.message ||
            "Terjadi kesalahan pada backend."
        },
        500
      );

    }

  }

};
