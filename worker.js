const corsHeaders = {
  "Access-Control-Allow-Origin": "https://pena-ai-engine.pages.dev",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
};


// =====================================================
// JSON RESPONSE
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
// HITUNG KARAKTER
// =====================================================

function hitungKarakter(text) {
  if (!text) return 0;

  return String(text).length;
}


// =====================================================
// BERSIHKAN HASIL AI
// =====================================================

function bersihkanHasilAI(text) {

  if (!text) {
    return "";
  }

  let hasil = String(text).trim();

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


  if (posisiInstruksi >= 0) {

    const bagian =
      hasil.substring(posisiInstruksi);

    const polaAwalCerita =
      /(?:^|\n\n)(Kota yang|Pagi itu|Siang itu|Sore itu|Malam itu|Hari itu|Ketika |Saat |Di pagi |Di siang |Di sore |Di malam |Di sebuah |Tahun \d{4})/i;

    const awalCerita =
      bagian.match(polaAwalCerita);

    if (awalCerita) {

      hasil =
        bagian.substring(
          awalCerita.index
        );

    } else {

      hasil =
        bagian
          .split("\n")
          .filter(line => {

            const t =
              line.trim();

            if (!t) {
              return true;
            }

            return !(
              /^(We need|Let's |Here is|Below is|Must |Make sure|Provide |End with|Just |The story)/i
                .test(t)
            );

          })
          .join("\n");
    }
  }


  hasil =
    hasil.replace(
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


  hasil =
    hasil.replace(
      /^#{1,6}\s+.*$/gm,
      ""
    );


  hasil =
    hasil.replace(
      /^\s*[-*•]\s+/gm,
      ""
    );


  hasil =
    hasil.replace(
      /^\s*\d+[.)]\s+/gm,
      ""
    );


  hasil =
    hasil.replace(
      /^\s*[-_*]{3,}\s*$/gm,
      ""
    );


  hasil =
    hasil.replace(
      /^(?:Berikut adalah|Berikut cerita|Berikut kisah|Berikut novel|Ini adalah cerita).*?:?\s*/i,
      ""
    );


  hasil =
    hasil.replace(
      /^\s*Bab\s+\d+.*$/gim,
      ""
    );


  hasil =
    hasil
      .replace(/\n{4,}/g, "\n\n")
      .trim();


  return hasil;
}


// =====================================================
// BERSIHKAN JUDUL BAB
// =====================================================

function bersihkanJudulBab(
  text,
  nomorBab
) {

  if (!text) {
    return `Bab ${nomorBab}`;
  }


  let judul =
    String(text)
      .trim();


  // Hilangkan label yang mungkin dibuat AI

  judul =
    judul
      .replace(
        /^judul\s*bab\s*[:\-]?\s*/i,
        ""
      )
      .replace(
        /^bab\s*\d+\s*[:\-–—]?\s*/i,
        ""
      )
      .replace(
        /^["'“”]+/,
        ""
      )
      .replace(
        /["'“”]+$/,
        ""
      )
      .replace(
        /^#+\s*/,
        ""
      )
      .trim();


  // Satu baris saja

  judul =
    judul
      .split("\n")[0]
      .trim();


  // Jangan terlalu panjang

  if (
    judul.length > 100
  ) {

    judul =
      judul.substring(
        0,
        100
      ).trim();

  }


  if (!judul) {

    return `Bab ${nomorBab}`;

  }


  return judul;
}


// =====================================================
// EKSTRAK JUDUL + ISI BAB
// =====================================================

function ekstrakJudulDanIsi(
  text,
  nomorBab
) {

  let hasil =
    String(text || "").trim();


  let judul = "";


  // ---------------------------------------------------
  // FORMAT UTAMA
  // <JUDUL_BAB>...</JUDUL_BAB>
  // <ISI_BAB>...</ISI_BAB>
  // ---------------------------------------------------

  const titleMatch =
    hasil.match(
      /<JUDUL_BAB>\s*([\s\S]*?)\s*<\/JUDUL_BAB>/i
    );


  const contentMatch =
    hasil.match(
      /<ISI_BAB>\s*([\s\S]*?)\s*<\/ISI_BAB>/i
    );


  if (titleMatch) {

    judul =
      titleMatch[1].trim();

  }


  if (contentMatch) {

    hasil =
      contentMatch[1].trim();

  } else {

    // -------------------------------------------------
    // FORMAT CADANGAN
    // -------------------------------------------------

    const titleLine =
      hasil.match(
        /^\s*(?:JUDUL_BAB|Judul Bab|Judul)\s*:\s*(.+?)(?:\n|$)/i
      );


    if (titleLine) {

      judul =
        titleLine[1].trim();


      hasil =
        hasil.substring(
          titleLine[0].length
        ).trim();

    }

  }


  judul =
    bersihkanJudulBab(
      judul,
      nomorBab
    );


  hasil =
    bersihkanHasilAI(
      hasil
    );


  return {
    judul_bab:
      judul,

    isi_bab:
      hasil
  };
}


// =====================================================
// AMBIL USER SUPABASE
// =====================================================

async function getUser(
  request,
  env
) {

  const authorization =
    request.headers.get(
      "Authorization"
    );


  if (!authorization) {
    return null;
  }


  const response =
    await fetch(
      `${env.SUPABASE_URL}/auth/v1/user`,
      {
        method: "GET",

        headers: {
          "Authorization":
            authorization,

          "apikey":
            env.SUPABASE_ANON_KEY
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
          "Content-Type":
            "application/json",

          "Authorization":
            `Bearer ${env.GROQ_API_KEY}`
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


  let hasil = "";


  if (
    typeof data.output_text === "string"
  ) {

    hasil =
      data.output_text;

  }


  if (
    !hasil &&
    Array.isArray(data.output)
  ) {

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
// SYSTEM PROMPT NOVEL UMUM
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

Cerita harus terasa seperti novel sungguhan.

Jangan menjelaskan proses penulisan.

Jangan menjelaskan instruksi.

Jangan menjelaskan prompt.

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

Jangan memulai cerita dengan kata "Bab".

Hasil akhir harus berupa cerita novel berbahasa Indonesia.

Jangan menulis instruksi sebelum cerita.

Jangan menulis penjelasan setelah cerita.

Mulai langsung dengan cerita.
`;


// =====================================================
// SYSTEM PROMPT BAB BERIKUTNYA
// =====================================================

const NOVEL_CHAPTER_SYSTEM_PROMPT = `
Kamu adalah penulis novel profesional berbahasa Indonesia
sekaligus editor kontinuitas cerita.

Kamu sedang menulis bab lanjutan dari sebuah novel yang sudah berjalan.

Prioritas utama:

1. Konsistensi cerita.
2. Konsistensi karakter.
3. Konsistensi hubungan.
4. Konsistensi waktu dan tempat.
5. Konsistensi fakta yang sudah terjadi.
6. Perkembangan konflik yang masuk akal.
7. Perkembangan emosi yang natural.
8. Kualitas prosa.
9. Dialog yang hidup.
10. Hook atau konsekuensi yang membuat pembaca ingin melanjutkan.

Jangan mengulang kejadian bab sebelumnya secara panjang.

Jangan membuat karakter tiba-tiba berubah sifat tanpa alasan.

Jangan menyelesaikan konflik utama terlalu cepat.

Jangan membuat hubungan romantis berkembang secara tiba-tiba
jika cerita sebelumnya belum membangunnya.

Jangan memperkenalkan fakta besar yang bertentangan dengan
informasi cerita sebelumnya.

Genre harus terasa dalam adegan, konflik, atmosfer, dialog,
dan perkembangan cerita.

Nuansa harus terasa secara alami, bukan dengan menyebutkan
nama nuansa tersebut.

Gaya penulisan harus konsisten dengan gaya novel yang diberikan.

Jangan menampilkan analisis.

Jangan menampilkan penjelasan.

Jangan menampilkan catatan untuk AI.

Jangan menampilkan proses berpikir.

Jangan menggunakan Markdown.

Jangan menggunakan bullet point.

Jangan menggunakan numbering.

Jangan membuat heading.

Jangan menulis "Bab" sebagai heading isi cerita.

Keluaran harus menggunakan format berikut secara persis:

<JUDUL_BAB>
judul bab
</JUDUL_BAB>

<ISI_BAB>
isi cerita novel
</ISI_BAB>

Judul harus merupakan judul bab yang menarik dan terasa
sebagai bagian dari novel sungguhan.

Judul wajib mencerminkan perkembangan penting dalam bab,
tetapi tidak boleh menjadi ringkasan datar isi bab.

Judul harus mempertimbangkan genre, nuansa, gaya, konflik,
atmosfer, simbol, emosi, atau peristiwa penting dalam bab.

Judul tidak boleh generik seperti:
"Bab Baru",
"Kelanjutan Cerita",
"Awal Baru",
"Konflik Baru",
"Masalah Baru",
"Kejadian Tak Terduga",
kecuali konteks cerita benar-benar membuat judul tersebut
sangat relevan.

Jangan menggunakan pola judul yang sama terus-menerus.

Jika genre misteri, judul boleh memiliki rasa teka-teki,
petunjuk, rahasia, identitas, suasana, atau simbol,
tetapi jangan memaksakan kata-kata tersebut.

Jika genre thriller, judul boleh memiliki rasa ancaman,
waktu, pengejaran, keputusan, tekanan, atau bahaya.

Jika genre romansa, judul dapat menonjolkan perasaan,
jarak, pertemuan, pilihan, pesan, kerinduan, atau perubahan
hubungan.

Jika genre drama, judul dapat menonjolkan keputusan,
keluarga, luka, pengorbanan, kehilangan, atau hubungan.

Jika genre horor, judul dapat memanfaatkan atmosfer,
tempat, suara, benda, kejadian aneh, atau kehadiran.

Jika genre fantasi, judul dapat memanfaatkan dunia,
artefak, kerajaan, kutukan, perjalanan, kekuatan, atau mitos.

Jika genre silat/wuxia, judul dapat mencerminkan perguruan,
jurus, pendekar, pedang, kitab, dendam, perseteruan,
perjalanan, atau suasana dunia persilatan.

Jika genre lain, sesuaikan pendekatan judul dengan genre tersebut.

Jangan meniru judul karya terkenal.

Jangan menggunakan judul yang terlalu panjang.

Utamakan judul sekitar 2 sampai 8 kata jika memungkinkan.

ISI_BAB harus berupa prosa novel utuh.

Target panjang isi bab sekitar 1800 sampai 2500 kata jika memungkinkan.
`;


// =====================================================
// TULIS CEPAT / AI WRITER
// =====================================================

async function tulisCepat(
  request,
  env,
  user,
  body
) {

  const judul =
    String(
      body?.judul ||
      "Tulisan Baru"
    ).trim();


  const prompt =
    String(
      body?.prompt ||
      ""
    ).trim();


  if (!prompt) {

    return json(
      {
        success: false,

        error:
          "Ide tulisan belum diisi."
      },
      400
    );

  }


  const userPrompt = `
Tulis cerita novel berdasarkan ide berikut.

Judul:
${judul}

Ide cerita:
${prompt}

Tulis langsung cerita dalam bentuk prosa novel berbahasa Indonesia.

Mulai dari adegan pertama.

Gunakan narasi dan dialog yang alami.

Kembangkan karakter, suasana, konflik, emosi, tindakan,
dan kejadian secara bertahap.

Jangan memberikan penjelasan sebelum cerita.

Jangan menampilkan instruksi.

Jangan menampilkan analisis.

Jangan menampilkan prompt.

Jangan menampilkan catatan untuk AI.

OUTPUT HANYA CERITA.
`;


  const hasilMentah =
    await callGroq(
      NOVEL_SYSTEM_PROMPT,
      userPrompt,
      env,
      4000
    );


  const hasilTulisan =
    bersihkanHasilAI(
      hasilMentah
    );


  if (!hasilTulisan) {

    throw new Error(
      "AI tidak menghasilkan cerita."
    );

  }


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

        body:
          JSON.stringify({

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
// TULIS BAB BERIKUTNYA
// =====================================================

async function tulisBabBerikutnya(
  request,
  env,
  user,
  body
) {

  const novelId =
    Number(
      body?.novel_id
    );


  if (!novelId) {

    return json(
      {
        success:
          false,

        error:
          "ID novel tidak ditemukan."
      },
      400
    );

  }


  const authorization =
    request.headers.get(
      "Authorization"
    );


  const supabaseHeaders = {

    "apikey":
      env.SUPABASE_ANON_KEY,

    "Authorization":
      authorization,

    "Content-Type":
      "application/json"

  };


  // ===================================================
  // AMBIL DATA NOVEL
  // ===================================================

  const novelResponse =
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/novel?id=eq.${encodeURIComponent(novelId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*`,
      {
        method:
          "GET",

        headers:
          supabaseHeaders

      }
    );


  const novelData =
    await novelResponse.json();


  if (!novelResponse.ok) {

    throw new Error(
      novelData?.message ||
      novelData?.hint ||
      "Gagal mengambil data novel."
    );

  }


  if (
    !Array.isArray(novelData) ||
    !novelData.length
  ) {

    return json(
      {
        success:
          false,

        error:
          "Novel tidak ditemukan atau bukan milik akun ini."
      },
      404
    );

  }


  const novel =
    novelData[0];


  // ===================================================
  // AMBIL BAB
  // ===================================================

  const babResponse =
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/novel_bab?novel_id=eq.${encodeURIComponent(novelId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*&order=nomor_bab.asc`,
      {
        method:
          "GET",

        headers:
          supabaseHeaders

      }
    );


  const babData =
    await babResponse.json();


  if (!babResponse.ok) {

    throw new Error(
      babData?.message ||
      babData?.hint ||
      "Gagal mengambil bab novel."
    );

  }


  const semuaBab =
    Array.isArray(babData)
      ? babData
      : [];


  // ===================================================
  // NOMOR BAB BARU
  // ===================================================

  const nomorBabBaru =
    semuaBab.length
      ? Math.max(
          ...semuaBab.map(
            b =>
              Number(
                b.nomor_bab
              ) || 0
          )
        ) + 1
      : 1;


  // ===================================================
  // AMBIL KARAKTER
  // ===================================================

  const karakterResponse =
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/novel_karakter?novel_id=eq.${encodeURIComponent(novelId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*`,
      {
        method:
          "GET",

        headers:
          supabaseHeaders

      }
    );


  const karakterData =
    await karakterResponse.json();


  const karakter =
    karakterResponse.ok &&
    Array.isArray(karakterData)
      ? karakterData
      : [];


  // ===================================================
  // BAB TERAKHIR
  // ===================================================

  const babTerakhir =
    semuaBab.length
      ? semuaBab[
          semuaBab.length - 1
        ]
      : null;


  // ===================================================
  // BAB KONTEKS
  // ===================================================

  const babKonteks =
    semuaBab.slice(
      -5
    );


  let konteksBab =
    "Belum ada bab sebelumnya.";


  if (
    babKonteks.length
  ) {

    konteksBab =
      babKonteks
        .map(
          b => {

            return `
BAB ${b.nomor_bab}
Judul: ${b.judul_bab || ""}
Isi:
${String(
  b.isi_bab || ""
).slice(
  0,
  12000
)}
`;

          }
        )
        .join(
          "\n\n"
        );

  }


  // ===================================================
  // KONTEKS JUDUL BAB SEBELUMNYA
  // ===================================================

  let konteksJudul =
    "Belum ada judul bab sebelumnya.";


  if (
    semuaBab.length
  ) {

    konteksJudul =
      semuaBab
        .slice(
          -12
        )
        .map(
          b =>
            `Bab ${b.nomor_bab} — ${b.judul_bab || ""}`
        )
        .join(
          "\n"
        );

  }


  // ===================================================
  // KONTEKS KARAKTER
  // ===================================================

  let konteksKarakter =
    "Belum ada data karakter.";


  if (
    karakter.length
  ) {

    konteksKarakter =
      karakter
        .map(
          k => {

            return `
Nama:
${k.nama || ""}

Umur:
${k.umur || ""}

Peran:
${k.peran || ""}

Sifat:
${k.sifat || ""}

Latar belakang:
${k.latar_belakang || ""}

Hubungan:
${k.hubungan || ""}

Tujuan:
${k.tujuan || ""}

Rahasia:
${k.rahasia || ""}

Catatan:
${k.catatan || ""}
`;

          }
        )
        .join(
          "\n\n"
        );

  }


  // ===================================================
  // PROMPT BAB
  // ===================================================

  const userPrompt = `
Kamu sedang melanjutkan sebuah novel yang sedang berjalan.

INFORMASI NOVEL

Judul novel:
${novel.judul || ""}

Genre:
${novel.genre || "Drama"}

Gaya penulisan:
${novel.gaya || "Natural"}

Nuansa:
${novel.nuansa || "Emosional"}

Mode:
${novel.mode || "Normal"}

Premis:
${novel.premis || ""}


BAB YANG AKAN DITULIS

Nomor:
${nomorBabBaru}


POLA JUDUL BAB SEBELUMNYA

${konteksJudul}


KARAKTER

${konteksKarakter}


BAB-BAB TERAKHIR

${konteksBab}


TUGAS UTAMA

Tulis Bab ${nomorBabBaru} sebagai kelanjutan langsung dari cerita.

Jangan mengulang bab sebelumnya.

Pertahankan fakta cerita yang sudah ada.

Pertahankan kepribadian dan hubungan karakter.

Jika bab terakhir meninggalkan konflik, pertanyaan,
rahasia, keputusan, ancaman, atau konsekuensi,
biarkan hal tersebut memengaruhi bab baru.

Bangun perkembangan cerita secara bertahap.

Jangan menyelesaikan konflik utama terlalu cepat.

Jangan memasukkan tokoh baru tanpa alasan cerita yang kuat.

Jangan membuat perubahan hubungan secara tiba-tiba.

Gunakan adegan konkret, dialog, tindakan, emosi,
dan suasana.

Genre harus terasa dari cara cerita berkembang,
bukan hanya dari kata-kata yang digunakan.

Nuansa harus terasa dari atmosfer dan emosi cerita.

Gaya penulisan harus konsisten.

Buat bab sekitar 1800 sampai 2500 kata jika memungkinkan.


ATURAN JUDUL

Buat judul yang benar-benar cocok untuk bab ini.

Judul harus mempertimbangkan:

- genre
- nuansa
- gaya
- konflik
- perkembangan karakter
- peristiwa penting
- atmosfer
- simbol atau objek penting
- perubahan hubungan
- konsekuensi dari bab sebelumnya

Judul tidak boleh hanya merangkum isi bab.

Judul harus membuat pembaca penasaran.

Judul tidak boleh menjadi spoiler besar.

Judul harus terasa sebagai bagian dari novel yang sama.

Perhatikan pola judul bab sebelumnya,
tetapi jangan menirunya secara mekanis.

Jangan mengulang kata atau pola judul
secara terus-menerus tanpa alasan.

Hindari judul generik seperti:

"Bab Baru"
"Kelanjutan Cerita"
"Awal Baru"
"Konflik Baru"
"Masalah Baru"
"Kejadian Tak Terduga"

kecuali benar-benar relevan.

Jika genre misteri,
judul dapat terasa seperti teka-teki,
petunjuk, rahasia, identitas, benda,
tempat, atau kejadian yang mencurigakan.

Jika genre thriller,
judul dapat terasa seperti ancaman,
tekanan waktu, pengejaran, keputusan,
bahaya, atau konsekuensi.

Jika genre romansa,
judul dapat terasa seperti perasaan,
jarak, pertemuan, pesan, pilihan,
kerinduan, atau perubahan hubungan.

Jika genre drama,
judul dapat terasa seperti keluarga,
keputusan, luka, pengorbanan,
kehilangan, pertentangan, atau hubungan.

Jika genre horor,
judul dapat memanfaatkan atmosfer,
tempat, suara, benda, malam,
atau sesuatu yang tidak seharusnya hadir.

Jika genre fantasi,
judul dapat memanfaatkan dunia,
artefak, kerajaan, kutukan,
kekuatan, perjalanan, atau mitos.

Jika genre silat/wuxia,
judul dapat mencerminkan perguruan,
jurus, pendekar, pedang, kitab,
dendam, perseteruan, perjalanan,
atau suasana dunia persilatan.

Jika genre campuran,
gabungkan rasa genre secara natural.

Jangan meniru judul karya terkenal.

Utamakan judul sekitar 2 sampai 8 kata.

HASIL WAJIB DALAM FORMAT INI:

<JUDUL_BAB>
tulis judul bab di sini
</JUDUL_BAB>

<ISI_BAB>
tulis isi cerita lengkap di sini
</ISI_BAB>

Jangan menambahkan apa pun di luar dua tag tersebut.
`;


  // ===================================================
  // PANGGIL GROQ
  // ===================================================

  const hasilMentah =
    await callGroq(
      NOVEL_CHAPTER_SYSTEM_PROMPT,
      userPrompt,
      env,
      7500
    );


  // ===================================================
  // PISAHKAN JUDUL DAN ISI
  // ===================================================

  const hasilBab =
    ekstrakJudulDanIsi(
      hasilMentah,
      nomorBabBaru
    );


  const judulBab =
    hasilBab.judul_bab;


  const hasilTulisan =
    hasilBab.isi_bab;


  if (!hasilTulisan) {

    throw new Error(
      "AI tidak menghasilkan isi bab."
    );

  }


  if (
    hitungKata(
      hasilTulisan
    ) < 500
  ) {

    console.log(
      `Peringatan: Bab ${nomorBabBaru} hanya ${hitungKata(hasilTulisan)} kata.`
    );

  }


  // ===================================================
  // SIMPAN BAB
  // ===================================================

  const insertResponse =
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/novel_bab`,
      {
        method:
          "POST",

        headers: {

          ...supabaseHeaders,

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
              nomorBabBaru,

            judul_bab:
              judulBab,

            isi_bab:
              hasilTulisan,

            ringkasan:
              "",

            // Field ini memang jumlah karakter.
            // Jumlah kata dihitung terpisah.

            jumlah_karakter:
              hitungKarakter(
                hasilTulisan
              ),

            status:
              "selesai"

          })

      }
    );


  const insertData =
    await insertResponse.json();


  if (!insertResponse.ok) {

    throw new Error(
      insertData?.message ||
      insertData?.hint ||
      insertData?.details ||
      "Bab gagal disimpan ke database."
    );

  }


  // ===================================================
  // UPDATE JUMLAH BAB
  // ===================================================

  const updateNovelResponse =
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/novel?id=eq.${encodeURIComponent(novelId)}&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method:
          "PATCH",

        headers: {

          ...supabaseHeaders,

          "Prefer":
            "return=minimal"

        },

        body:
          JSON.stringify({

            bab_selesai:
              nomorBabBaru,

            updated_at:
              new Date().toISOString()

          })

      }
    );


  if (
    !updateNovelResponse.ok
  ) {

    const updateError =
      await updateNovelResponse.text();


    console.log(
      "Gagal update jumlah bab:",
      updateError
    );

  }


  // ===================================================
  // SIMPAN RIWAYAT AI
  // ===================================================

  try {

    await fetch(
      `${env.SUPABASE_URL}/rest/v1/riwayat_penulisan`,
      {
        method:
          "POST",

        headers: {

          ...supabaseHeaders,

          "Prefer":
            "return=minimal"

        },

        body:
          JSON.stringify({

            user_id:
              user.id,

            judul:
              `${novel.judul || "Novel"} - Bab ${nomorBabBaru} - ${judulBab}`,

            jenis:
              "Novel",

            prompt:
              userPrompt,

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
      "Gagal menyimpan riwayat bab:",
      error.message
    );

  }


  // ===================================================
  // RESPONSE
  // ===================================================

  return json({

    success:
      true,

    message:
      `Bab ${nomorBabBaru} — ${judulBab} berhasil ditulis dan disimpan.`,

    novel_id:
      novelId,

    nomor_bab:
      nomorBabBaru,

    judul_bab:
      judulBab,

    isi_bab:
      hasilTulisan,

    text:
      hasilTulisan,

    content:
      hasilTulisan,

    jumlah_kata:
      hitungKata(
        hasilTulisan
      ),

    jumlah_karakter:
      hitungKarakter(
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

  const authorization =
    request.headers.get(
      "Authorization"
    );


  const response =
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/riwayat_penulisan?user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc`,
      {
        method:
          "GET",

        headers: {

          "apikey":
            env.SUPABASE_ANON_KEY,

          "Authorization":
            authorization

        }
      }
    );


  const data =
    await response.json();


  if (!response.ok) {

    return json(
      {
        success:
          false,

        data:
          [],

        error:
          data

      },
      response.status
    );

  }


  return json({

    success:
      true,

    data:
      data

  });
}


// =====================================================
// MAIN CLOUDFLARE WORKER
// =====================================================

export default {

  async fetch(
    request,
    env
  ) {

    // -------------------------------------------------
    // OPTIONS / CORS
    // -------------------------------------------------

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


    // -------------------------------------------------
    // GET
    // -------------------------------------------------

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


    // -------------------------------------------------
    // POST SAJA
    // -------------------------------------------------

    if (
      request.method !==
      "POST"
    ) {

      return json(
        {
          success:
            false,

          error:
            "Method tidak diizinkan."

        },
        405
      );

    }


    // -------------------------------------------------
    // CEK USER
    // -------------------------------------------------

    const user =
      await getUser(
        request,
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


    // -------------------------------------------------
    // BACA BODY HANYA SEKALI
    // -------------------------------------------------

    let body;


    try {

      body =
        await request.json();

    } catch (error) {

      return json(
        {
          success:
            false,

          error:
            "Data JSON tidak valid."

        },
        400
      );

    }


    const action =
      body?.action;


    // -------------------------------------------------
    // ROUTING
    // -------------------------------------------------

    try {

      switch (action) {

        case "write":

          return await tulisCepat(
            request,
            env,
            user,
            body
          );


        case "write_chapter":

          return await tulisBabBerikutnya(
            request,
            env,
            user,
            body
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
              success:
                false,

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

};
