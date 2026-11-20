const corsHeaders = {
  "Access-Control-Allow-Origin": "https://pena-ai-engine.pages.dev",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
};

const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_RESPONSES_URL = "https://api.groq.com/openai/v1/responses";
const MIN_CHAPTER_WORDS = 1800;
const TARGET_CHAPTER_WORDS = "1800 sampai 2500";


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
  if (text === null || text === undefined) return 0;

  const bersih = String(text).trim();
  if (!bersih) return 0;

  return (bersih.match(/\S+/g) || []).length;
}


// =====================================================
// HITUNG KARAKTER
// =====================================================

function hitungKarakter(text) {
  if (text === null || text === undefined) return 0;
  return String(text).length;
}


// =====================================================
// DETEKSI BAB PLACEHOLDER YANG TELANJUR TERSIMPAN
// =====================================================

function isiAdalahPlaceholder(text) {
  const normalized = String(text || "")
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .toLowerCase();

  return (
    !normalized ||
    /^(?:null|undefined|placeholder|tidakada|belumada|isikosong)$/i.test(normalized)
  );
}


// =====================================================
// BERSIHKAN HASIL AI
// =====================================================

function bersihkanHasilAI(text) {
  if (!text) return "";

  let hasil = String(text).trim();

  // Lepaskan code fence jika model tetap membungkus cerita.
  hasil = hasil
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Lepaskan tag pembungkus bila masih tertinggal.
  hasil = hasil
    .replace(/<\/?(?:ISI_BAB|JUDUL_BAB)>/gi, "")
    .trim();

  // Hilangkan pembuka singkat yang bukan bagian dari cerita,
  // hanya bila berada tepat di awal teks.
  hasil = hasil.replace(
    /^(?:Berikut adalah cerita(?: novel)?|Berikut cerita(?: novel)?|Berikut kisah|Ini adalah cerita)\s*[:：-]?\s*/i,
    ""
  );

  // Rapikan spasi tanpa mengubah isi paragraf.
  hasil = hasil
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n")
    .trim();

  return hasil;
}


// =====================================================
// BERSIHKAN JUDUL BAB
// =====================================================

function bersihkanJudulBab(text) {
  if (!text) return "";

  let judul = String(text).trim();

  judul = judul
    .replace(/^\s*(?:judul\s*bab|judul)\s*[:：-]?\s*/i, "")
    .replace(/^\s*<\/?JUDUL_BAB>\s*/i, "")
    .replace(/^\s*bab\s*\d+\s*[:：\-–—]?\s*/i, "")
    .replace(/^["'“”‘’]+/, "")
    .replace(/["'“”‘’]+$/, "")
    .replace(/^#+\s*/, "")
    .trim();

  judul = judul.split("\n")[0].trim();

  if (judul.length > 100) {
    judul = judul.substring(0, 100).trim();
  }

  const judulNormal = judul
    .toLowerCase()
    .replace(/[.。…!！?？\-–—_\s]/g, "");

  const judulTidakValid = new Set([
    "",
    "bab",
    "judul",
    "judulbab",
    "babbaru",
    "kelanjutancerita",
    "awalbaru",
    "konflikbaru",
    "masalahbaru",
    "kejadiantakterduga",
    "...",
    "tbd",
    "untitled"
  ]);

  if (
    !judul ||
    judul.length < 2 ||
    judulTidakValid.has(judulNormal) ||
    /^[.。…\-–—_]+$/.test(judul)
  ) {
    return "";
  }

  return judul;
}


// =====================================================
// EKSTRAK BAGIAN BERTAG
// =====================================================

function ambilIsiTag(text, namaTag) {
  const polaBuka = new RegExp(`<${namaTag}\\s*>`, "i");
  const buka = polaBuka.exec(text);
  if (!buka) return null;

  const mulaiIsi = buka.index + buka[0].length;
  const sisa = text.slice(mulaiIsi);
  const polaTutup = new RegExp(`</${namaTag}\\s*>`, "i");
  const tutup = polaTutup.exec(sisa);

  // Untuk pemulihan format yang tag penutupnya tertinggal,
  // gunakan tag bagian berikutnya atau akhir teks sebagai batas.
  let akhir = sisa.length;
  if (tutup) {
    akhir = tutup.index;
  } else if (namaTag.toUpperCase() === "JUDUL_BAB") {
    const bagianIsi = /<ISI_BAB\s*>/i.exec(sisa);
    if (bagianIsi) akhir = bagianIsi.index;
  }

  return {
    value: sisa.slice(0, akhir).trim(),
    found: true,
    closed: Boolean(tutup)
  };
}


// =====================================================
// EKSTRAK JUDUL + ISI BAB
// =====================================================

function ekstrakJudulDanIsi(text) {
  const mentah = String(text || "")
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let judulMentah = "";
  let isiMentah = "";
  let formatDitemukan = false;

  // Format utama dari prompt.
  const titleTag = ambilIsiTag(mentah, "JUDUL_BAB");
  const contentTag = ambilIsiTag(mentah, "ISI_BAB");

  if (titleTag && contentTag) {
    judulMentah = titleTag.value;
    isiMentah = contentTag.value;
    formatDitemukan = true;
  }

  // Format cadangan: label teks biasa. Tetap harus ada label
  // untuk judul DAN isi; jangan menebak dari teks bebas.
  if (!formatDitemukan) {
    const titleLine = mentah.match(
      /^\s*(?:JUDUL_BAB|Judul Bab|Judul)\s*[:：]\s*([^\r\n]+)\s*/i
    );
    const bodyLabel = /(?:^|\n)\s*(?:ISI_BAB|Isi Bab|Isi Cerita)\s*[:：]\s*/i.exec(mentah);

    if (titleLine && bodyLabel) {
      judulMentah = titleLine[1].trim();
      isiMentah = mentah.slice(bodyLabel.index + bodyLabel[0].length).trim();
      formatDitemukan = true;
    }
  }

  const judul = bersihkanJudulBab(judulMentah);
  const isi = bersihkanHasilAI(isiMentah);

  return {
    judul_bab: judul,
    isi_bab: isi,
    format_valid: formatDitemukan
  };
}


// =====================================================
// AMBIL USER SUPABASE
// =====================================================

async function getUser(request, env) {
  const authorization = request.headers.get("Authorization");

  if (!authorization) return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error("Konfigurasi Supabase belum lengkap di Cloudflare Worker.");
  }

  const response = await fetch(
    `${env.SUPABASE_URL}/auth/v1/user`,
    {
      method: "GET",
      headers: {
        "Authorization": authorization,
        "apikey": env.SUPABASE_ANON_KEY
      }
    }
  );

  if (!response.ok) return null;

  return await response.json();
}


// =====================================================
// PANGGIL GROQ RESPONSES API
// =====================================================

async function callGroq(
  systemPrompt,
  userPrompt,
  env,
  maxOutputTokens = 4000
) {
  if (!env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY belum diatur di Cloudflare Worker.");
  }

  const response = await fetch(GROQ_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      instructions: systemPrompt,
      input: userPrompt,
      max_output_tokens: maxOutputTokens,
      reasoning: {
        effort: "low"
      },
      temperature: 0.85,
      store: false
    })
  });

  const responseText = await response.text();
  let data;

  try {
    data = JSON.parse(responseText);
  } catch (error) {
    throw new Error(
      `Respons Groq bukan JSON yang valid (HTTP ${response.status}).`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      data?.message ||
      `Groq gagal memproses permintaan (HTTP ${response.status}).`
    );
  }

  if (data?.error) {
    throw new Error(
      data.error.message || "Groq melaporkan kesalahan saat menghasilkan respons."
    );
  }

  // Jangan gunakan respons yang terpotong atau belum selesai.
  if (data?.status && data.status !== "completed") {
    const alasan =
      data?.incomplete_details?.reason ||
      data?.status ||
      "status tidak diketahui";

    throw new Error(
      `Respons Groq belum lengkap (${alasan}). Bab tidak disimpan. Silakan coba lagi.`
    );
  }

  let hasil = "";

  // output_text merupakan bentuk teks praktis bila tersedia.
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    hasil = data.output_text.trim();
  }

  // Format Responses API: ambil hanya pesan final assistant.
  // Item type "reasoning" dan "reasoning_text" sengaja diabaikan.
  if (!hasil && Array.isArray(data.output)) {
    const potongan = [];

    for (const item of data.output) {
      if (item?.type !== "message") continue;
      if (item?.role && item.role !== "assistant") continue;
      if (!Array.isArray(item.content)) continue;

      for (const content of item.content) {
        if (
          (content?.type === "output_text" || content?.type === "text") &&
          typeof content.text === "string" &&
          content.text.trim()
        ) {
          potongan.push(content.text.trim());
        }
      }
    }

    hasil = potongan.join("\n\n").trim();
  }

  // Cadangan kompatibilitas bila provider mengembalikan bentuk
  // Chat Completions, tanpa mengubah endpoint utama Responses API.
  if (
    !hasil &&
    Array.isArray(data.choices) &&
    typeof data.choices[0]?.message?.content === "string"
  ) {
    hasil = data.choices[0].message.content.trim();
  }

  if (!hasil) {
    throw new Error(
      "Groq tidak mengembalikan teks final assistant. Bab tidak disimpan."
    );
  }

  return hasil;
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
Jangan menulis instruksi sebelum cerita.
Jangan menulis penjelasan setelah cerita.

Hasil akhir harus berupa cerita novel berbahasa Indonesia.
Mulai langsung dengan cerita.
`;


// =====================================================
// SYSTEM PROMPT BAB BERIKUTNYA
// =====================================================

const NOVEL_CHAPTER_SYSTEM_PROMPT = `
Kamu adalah penulis novel profesional berbahasa Indonesia sekaligus editor kontinuitas cerita.

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
Jangan membuat hubungan romantis berkembang secara tiba-tiba jika cerita sebelumnya belum membangunnya.
Jangan memperkenalkan fakta besar yang bertentangan dengan informasi cerita sebelumnya.

Genre harus terasa dalam adegan, konflik, atmosfer, dialog, dan perkembangan cerita.
Nuansa harus terasa secara alami, bukan dengan menyebutkan nama nuansa tersebut.
Gaya penulisan harus konsisten dengan gaya novel yang diberikan.

Jangan menampilkan analisis, penjelasan, catatan untuk AI, atau proses berpikir.
Jangan menggunakan Markdown, bullet point, numbering, atau heading.
Jangan menulis "Bab" sebagai heading isi cerita.

KELUARAN WAJIB menggunakan format berikut secara persis:

<JUDUL_BAB>
Judul bab yang dibuat khusus untuk kejadian dan perkembangan bab ini.
</JUDUL_BAB>

<ISI_BAB>
Isi cerita novel.
</ISI_BAB>

Judul wajib dibuat otomatis berdasarkan genre, nuansa, gaya penulisan, konflik, perkembangan karakter, peristiwa penting, atmosfer, simbol, dan konsekuensi dari bab sebelumnya.

Judul harus menarik, terasa sebagai bagian dari novel sungguhan, bukan ringkasan datar, dan tidak membocorkan kejutan besar.
Utamakan judul 2 sampai 8 kata jika memungkinkan. Jangan meniru judul karya terkenal.
Hindari judul generik seperti "Bab Baru", "Kelanjutan Cerita", "Awal Baru", "Konflik Baru", "Masalah Baru", atau "Kejadian Tak Terduga", kecuali benar-benar sangat relevan.
Perhatikan judul bab sebelumnya dan hindari mengulang pola yang sama tanpa alasan.

Sesuaikan rasa judul dan cerita dengan genre:
- Misteri: teka-teki, petunjuk, rahasia, identitas, benda, tempat, atau kejadian mencurigakan.
- Thriller: ancaman, tekanan waktu, pengejaran, keputusan, bahaya, atau konsekuensi.
- Romansa: perasaan, jarak, pertemuan, pesan, pilihan, kerinduan, atau perubahan hubungan.
- Drama: keluarga, keputusan, luka, pengorbanan, kehilangan, pertentangan, atau hubungan.
- Horor: atmosfer, tempat, suara, benda, malam, atau sesuatu yang tidak seharusnya hadir.
- Fantasi: dunia, artefak, kerajaan, kutukan, kekuatan, perjalanan, atau mitos.
- Silat/wuxia: perguruan, jurus, pendekar, pedang, kitab, dendam, perseteruan, perjalanan, atau suasana dunia persilatan.
- Genre campuran atau genre lain: sesuaikan secara alami dengan cerita.

ISI_BAB harus berupa prosa novel utuh, bukan sinopsis, outline, atau rangkuman.

Target isi bab adalah 1.800 sampai 2.500 kata. Usahakan sekitar 2.000 sampai 2.200 kata agar memiliki ruang untuk penutup yang utuh.
Jangan mengakhiri cerita hanya karena sudah mencapai beberapa paragraf. Selesaikan adegan dan perkembangan emosional bab secara wajar, lalu tutup dengan konsekuensi, pertanyaan, atau hook yang kuat.
Jangan mengorbankan kualitas dan kesinambungan cerita demi menambah jumlah kata.

Jangan menambahkan teks apa pun di luar dua tag tersebut.
`;


// =====================================================
// TULIS CEPAT / AI WRITER
// =====================================================

async function tulisCepat(request, env, user, body) {
  const judul = String(body?.judul || "Tulisan Baru").trim();
  const prompt = String(body?.prompt || "").trim();

  if (!prompt) {
    return json(
      {
        success: false,
        error: "Ide tulisan belum diisi."
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
Kembangkan karakter, suasana, konflik, emosi, tindakan, dan kejadian secara bertahap.
Jangan memberikan penjelasan sebelum cerita.
Jangan menampilkan instruksi, analisis, prompt, atau catatan untuk AI.

OUTPUT HANYA CERITA.
`;

  const hasilMentah = await callGroq(
    NOVEL_SYSTEM_PROMPT,
    userPrompt,
    env,
    4000
  );

  const hasilTulisan = bersihkanHasilAI(hasilMentah);

  if (!hasilTulisan || hitungKata(hasilTulisan) < 20) {
    throw new Error("AI tidak menghasilkan cerita yang valid.");
  }

  try {
    const saveResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/riwayat_penulisan`,
      {
        method: "POST",
        headers: {
          "apikey": env.SUPABASE_ANON_KEY,
          "Authorization": request.headers.get("Authorization"),
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          user_id: user.id,
          judul: judul,
          jenis: "Novel",
          prompt: prompt,
          hasil_tulisan: hasilTulisan,
          jumlah_kata: hitungKata(hasilTulisan)
        })
      }
    );

    if (!saveResponse.ok) {
      const errorText = await saveResponse.text();
      console.log("Gagal menyimpan riwayat:", errorText);
    }
  } catch (error) {
    console.log("Gagal menyimpan riwayat:", error.message);
  }

  return json({
    success: true,
    judul: judul,
    hasil_tulisan: hasilTulisan,
    text: hasilTulisan,
    content: hasilTulisan,
    jumlah_kata: hitungKata(hasilTulisan)
  });
}


// =====================================================
// TULIS BAB BERIKUTNYA
// =====================================================

async function tulisBabBerikutnya(request, env, user, body) {
  const novelId = Number(body?.novel_id);

  if (!Number.isSafeInteger(novelId) || novelId <= 0) {
    return json(
      {
        success: false,
        error: "ID novel tidak ditemukan atau tidak valid."
      },
      400
    );
  }

  const authorization = request.headers.get("Authorization");

  if (!authorization) {
    return json(
      {
        success: false,
        error: "Sesi login tidak ditemukan. Silakan login kembali."
      },
      401
    );
  }

  const supabaseHeaders = {
    "apikey": env.SUPABASE_ANON_KEY,
    "Authorization": authorization,
    "Content-Type": "application/json"
  };

  // ===================================================
  // AMBIL DATA NOVEL
  // ===================================================

  const novelResponse = await fetch(
    `${env.SUPABASE_URL}/rest/v1/novel?id=eq.${encodeURIComponent(novelId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*`,
    {
      method: "GET",
      headers: supabaseHeaders
    }
  );

  const novelResponseText = await novelResponse.text();
  let novelData;

  try {
    novelData = JSON.parse(novelResponseText);
  } catch (error) {
    throw new Error("Supabase mengembalikan data novel yang tidak valid.");
  }

  if (!novelResponse.ok) {
    throw new Error(
      novelData?.message ||
      novelData?.hint ||
      "Gagal mengambil data novel."
    );
  }

  if (!Array.isArray(novelData) || !novelData.length) {
    return json(
      {
        success: false,
        error: "Novel tidak ditemukan atau bukan milik akun ini."
      },
      404
    );
  }

  const novel = novelData[0];

  // ===================================================
  // AMBIL BAB YANG SUDAH ADA
  // ===================================================

  const babResponse = await fetch(
    `${env.SUPABASE_URL}/rest/v1/novel_bab?novel_id=eq.${encodeURIComponent(novelId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*&order=nomor_bab.asc`,
    {
      method: "GET",
      headers: supabaseHeaders
    }
  );

  const babResponseText = await babResponse.text();
  let babData;

  try {
    babData = JSON.parse(babResponseText);
  } catch (error) {
    throw new Error("Supabase mengembalikan daftar bab yang tidak valid.");
  }

  if (!babResponse.ok) {
    throw new Error(
      babData?.message ||
      babData?.hint ||
      "Gagal mengambil bab novel."
    );
  }

  const semuaBab = Array.isArray(babData) ? babData : [];

  // ===================================================
  // NOMOR BAB BARU / PERBAIKI BAB PLACEHOLDER TERAKHIR
  // ===================================================

  const babTerakhirTersimpan = semuaBab.length
    ? semuaBab[semuaBab.length - 1]
    : null;

  // Kasus khusus: versi worker sebelumnya sempat menyimpan "..."
  // sebagai isi bab. Jika BAB TERAKHIR hanya placeholder, gunakan
  // kembali nomor itu dan perbarui barisnya, bukan membuat Bab berikutnya.
  // Bab berisi cerita sungguhan tidak akan ditimpa oleh pemeriksaan ini.
  const perbaikiBabTerakhir = Boolean(
    babTerakhirTersimpan &&
    isiAdalahPlaceholder(babTerakhirTersimpan.isi_bab)
  );

  const nomorBabBaru = perbaikiBabTerakhir
    ? Number(babTerakhirTersimpan.nomor_bab)
    : (semuaBab.length
        ? Math.max(...semuaBab.map(b => Number(b.nomor_bab) || 0)) + 1
        : 1);

  const babUntukKonteks = perbaikiBabTerakhir
    ? semuaBab.slice(0, -1)
    : semuaBab;

  // ===================================================
  // AMBIL KARAKTER
  // ===================================================

  const karakterResponse = await fetch(
    `${env.SUPABASE_URL}/rest/v1/novel_karakter?novel_id=eq.${encodeURIComponent(novelId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*`,
    {
      method: "GET",
      headers: supabaseHeaders
    }
  );

  const karakterResponseText = await karakterResponse.text();
  let karakterData;

  try {
    karakterData = karakterResponseText ? JSON.parse(karakterResponseText) : [];
  } catch (error) {
    throw new Error("Data karakter dari Supabase tidak dapat dibaca.");
  }

  if (!karakterResponse.ok) {
    throw new Error(
      karakterData?.message ||
      karakterData?.hint ||
      "Gagal mengambil data karakter novel. Bab belum ditulis."
    );
  }

  const karakter = Array.isArray(karakterData) ? karakterData : [];

  // ===================================================
  // BAB KONTEKS
  // ===================================================

  const babKonteks = babUntukKonteks.slice(-5);
  let konteksBab = "Belum ada bab sebelumnya.";

  if (babKonteks.length) {
    konteksBab = babKonteks.map(b => {
      const isiSebelumnya = String(b.isi_bab || "");
      // Ambil bagian akhir setiap bab supaya peristiwa terakhir,
      // keputusan, atau cliffhanger tetap masuk ke konteks model.
      const potonganIsi = isiSebelumnya.length > 12000
        ? isiSebelumnya.slice(-12000)
        : isiSebelumnya;

      return `
BAB ${b.nomor_bab}
Judul: ${b.judul_bab || ""}
Isi:
${potonganIsi}
`;
    }).join("\n\n");
  }

  // ===================================================
  // KONTEKS JUDUL BAB SEBELUMNYA
  // ===================================================

  let konteksJudul = "Belum ada judul bab sebelumnya.";

  if (babUntukKonteks.length) {
    konteksJudul = babUntukKonteks
      .slice(-12)
      .map(b => `Bab ${b.nomor_bab} — ${b.judul_bab || ""}`)
      .join("\n");
  }

  // ===================================================
  // KONTEKS KARAKTER
  // ===================================================

  let konteksKarakter = "Belum ada data karakter.";

  if (karakter.length) {
    konteksKarakter = karakter.map(k => `
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
`).join("\n\n");
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
Jika bab terakhir meninggalkan konflik, pertanyaan, rahasia, keputusan, ancaman, atau konsekuensi, biarkan hal tersebut memengaruhi bab baru.
Bangun perkembangan cerita secara bertahap.
Jangan menyelesaikan konflik utama terlalu cepat.
Jangan memasukkan tokoh baru tanpa alasan cerita yang kuat.
Jangan membuat perubahan hubungan secara tiba-tiba.
Gunakan adegan konkret, dialog, tindakan, emosi, dan suasana.
Genre harus terasa dari cara cerita berkembang, bukan hanya dari kata-kata yang digunakan.
Nuansa harus terasa dari atmosfer dan emosi cerita.
Gaya penulisan harus konsisten.

Panjang isi bab WAJIB ditargetkan 1.800 sampai 2.500 kata. Usahakan sekitar 2.000 sampai 2.200 kata. Jumlah kata hanya dihitung dari isi di dalam tag ISI_BAB, bukan judul.

ATURAN JUDUL

Buat judul yang benar-benar cocok untuk bab ini. Judul harus mempertimbangkan genre, nuansa, gaya, konflik, perkembangan karakter, peristiwa penting, atmosfer, simbol atau objek penting, perubahan hubungan, dan konsekuensi dari bab sebelumnya.
Judul tidak boleh hanya merangkum isi bab. Judul harus membuat pembaca penasaran tetapi tidak menjadi spoiler besar.
Judul harus terasa sebagai bagian dari novel yang sama. Perhatikan pola judul bab sebelumnya, tetapi jangan menirunya secara mekanis.
Hindari judul generik seperti "Bab Baru", "Kelanjutan Cerita", "Awal Baru", "Konflik Baru", "Masalah Baru", atau "Kejadian Tak Terduga", kecuali benar-benar relevan.
Jangan meniru judul karya terkenal. Utamakan 2 sampai 8 kata.

HASIL WAJIB DALAM FORMAT INI:

<JUDUL_BAB>
Tulis judul bab di sini.
</JUDUL_BAB>

<ISI_BAB>
Tulis isi cerita novel lengkap di sini.
</ISI_BAB>

Jangan menambahkan apa pun di luar dua tag tersebut.
`;

  // ===================================================
  // PANGGIL GROQ - SATU KALI SAJA
  // ===================================================

  const hasilMentah = await callGroq(
    NOVEL_CHAPTER_SYSTEM_PROMPT,
    userPrompt,
    env,
    12000
  );

  // ===================================================
  // PISAHKAN JUDUL DAN ISI
  // ===================================================

  const hasilBab = ekstrakJudulDanIsi(hasilMentah);
  const judulBab = hasilBab.judul_bab;
  const hasilTulisan = hasilBab.isi_bab;
  const jumlahKata = hitungKata(hasilTulisan);

  // ===================================================
  // VALIDASI KETAT SEBELUM INSERT
  // ===================================================

  if (!hasilBab.format_valid) {
    return json(
      {
        success: false,
        saved: false,
        error: "Format respons AI tidak valid. Tag <JUDUL_BAB> dan <ISI_BAB> harus tersedia. Bab tidak disimpan.",
        nomor_bab: nomorBabBaru
      },
      422
    );
  }

  if (!judulBab) {
    return json(
      {
        success: false,
        saved: false,
        error: "AI tidak menghasilkan judul bab yang valid. Bab tidak disimpan.",
        nomor_bab: nomorBabBaru
      },
      422
    );
  }

  if (!hasilTulisan || jumlahKata === 0) {
    return json(
      {
        success: false,
        saved: false,
        error: "Isi bab kosong. Bab tidak disimpan.",
        nomor_bab: nomorBabBaru,
        judul_bab: judulBab,
        jumlah_kata: jumlahKata
      },
      422
    );
  }

  // Cegah placeholder, titik-titik, atau jawaban noncerita.
  const isiTanpaTandaBaca = hasilTulisan
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .toLowerCase();

  if (
    !isiTanpaTandaBaca ||
    /^(?:null|undefined|tidaktersedia|belumtersedia|isicerita|placeholder)+$/i.test(isiTanpaTandaBaca)
  ) {
    return json(
      {
        success: false,
        saved: false,
        error: "Respons AI hanya berisi placeholder atau bukan cerita. Bab tidak disimpan.",
        nomor_bab: nomorBabBaru,
        judul_bab: judulBab,
        jumlah_kata: jumlahKata
      },
      422
    );
  }

  if (jumlahKata < MIN_CHAPTER_WORDS) {
    return json(
      {
        success: false,
        saved: false,
        error: `Bab ${nomorBabBaru} belum memenuhi target minimal ${MIN_CHAPTER_WORDS.toLocaleString("id-ID")} kata. Hasil saat ini ${jumlahKata.toLocaleString("id-ID")} kata. Bab tidak disimpan agar tidak masuk ke novel dalam keadaan terlalu pendek atau terpotong.`,
        nomor_bab: nomorBabBaru,
        judul_bab: judulBab,
        jumlah_kata: jumlahKata,
        target_kata: TARGET_CHAPTER_WORDS
      },
      422
    );
  }

  if (jumlahKata > 2500) {
    console.log(`Catatan: Bab ${nomorBabBaru} berjumlah ${jumlahKata} kata, di atas target 2.500 kata.`);
  }

  // ===================================================
  // SIMPAN BAB - HANYA SETELAH LOLOS VALIDASI
  // ===================================================

  const dataBabUntukDisimpan = {
    novel_id: novelId,
    user_id: user.id,
    nomor_bab: nomorBabBaru,
    judul_bab: judulBab,
    isi_bab: hasilTulisan,
    ringkasan: "",
    // Kolom yang tersedia pada kode/schema saat ini adalah jumlah_karakter.
    jumlah_karakter: hitungKarakter(hasilTulisan),
    status: "selesai"
  };

  const urlSimpanBab = perbaikiBabTerakhir
    ? `${env.SUPABASE_URL}/rest/v1/novel_bab?novel_id=eq.${encodeURIComponent(novelId)}&user_id=eq.${encodeURIComponent(user.id)}&nomor_bab=eq.${encodeURIComponent(nomorBabBaru)}`
    : `${env.SUPABASE_URL}/rest/v1/novel_bab`;

  const insertResponse = await fetch(
    urlSimpanBab,
    {
      method: perbaikiBabTerakhir ? "PATCH" : "POST",
      headers: {
        ...supabaseHeaders,
        "Prefer": "return=representation"
      },
      body: JSON.stringify(dataBabUntukDisimpan)
    }
  );

  const insertResponseText = await insertResponse.text();
  let insertData = null;

  if (insertResponseText) {
    try {
      insertData = JSON.parse(insertResponseText);
    } catch (error) {
      insertData = null;
    }
  }

  if (!insertResponse.ok) {
    throw new Error(
      insertData?.message ||
      insertData?.hint ||
      insertData?.details ||
      insertResponseText ||
      "Bab gagal disimpan ke database."
    );
  }

  if (Array.isArray(insertData) && insertData.length === 0) {
    throw new Error(
      perbaikiBabTerakhir
        ? "Bab placeholder lama tidak berhasil diperbarui di Supabase."
        : "Supabase tidak mengembalikan baris bab yang tersimpan. Periksa izin database."
    );
  }

  // ===================================================
  // UPDATE JUMLAH BAB
  // ===================================================

  const updateNovelResponse = await fetch(
    `${env.SUPABASE_URL}/rest/v1/novel?id=eq.${encodeURIComponent(novelId)}&user_id=eq.${encodeURIComponent(user.id)}`,
    {
      method: "PATCH",
      headers: {
        ...supabaseHeaders,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        bab_selesai: nomorBabBaru,
        updated_at: new Date().toISOString()
      })
    }
  );

  if (!updateNovelResponse.ok) {
    const updateError = await updateNovelResponse.text();
    console.log("Gagal update jumlah bab:", updateError);
  }

  // ===================================================
  // SIMPAN RIWAYAT AI (TIDAK MENGGAGALKAN BAB UTAMA)
  // ===================================================

  try {
    const historyResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/riwayat_penulisan`,
      {
        method: "POST",
        headers: {
          ...supabaseHeaders,
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          user_id: user.id,
          judul: `${novel.judul || "Novel"} - Bab ${nomorBabBaru} - ${judulBab}`,
          jenis: "Novel",
          prompt: userPrompt,
          hasil_tulisan: hasilTulisan,
          jumlah_kata: jumlahKata
        })
      }
    );

    if (!historyResponse.ok) {
      const historyError = await historyResponse.text();
      console.log("Gagal menyimpan riwayat bab:", historyError);
    }
  } catch (error) {
    console.log("Gagal menyimpan riwayat bab:", error.message);
  }

  // ===================================================
  // RESPONSE
  // ===================================================

  return json({
    success: true,
    saved: true,
    diperbaiki_dari_placeholder: perbaikiBabTerakhir,
    message: perbaikiBabTerakhir
      ? `Bab ${nomorBabBaru} yang sebelumnya kosong berhasil diperbaiki dan disimpan (${jumlahKata.toLocaleString("id-ID")} kata).`
      : `Bab ${nomorBabBaru} — ${judulBab} berhasil ditulis dan disimpan (${jumlahKata.toLocaleString("id-ID")} kata).`,
    novel_id: novelId,
    nomor_bab: nomorBabBaru,
    judul_bab: judulBab,
    isi_bab: hasilTulisan,
    text: hasilTulisan,
    content: hasilTulisan,
    jumlah_kata: jumlahKata,
    jumlah_karakter: hitungKarakter(hasilTulisan)
  });
}


// =====================================================
// AMBIL RIWAYAT
// =====================================================

async function ambilRiwayat(request, env, user) {
  const authorization = request.headers.get("Authorization");

  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/riwayat_penulisan?user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc`,
    {
      method: "GET",
      headers: {
        "apikey": env.SUPABASE_ANON_KEY,
        "Authorization": authorization
      }
    }
  );

  const responseText = await response.text();
  let data;

  try {
    data = responseText ? JSON.parse(responseText) : [];
  } catch (error) {
    return json(
      {
        success: false,
        data: [],
        error: "Data riwayat dari Supabase tidak valid."
      },
      502
    );
  }

  if (!response.ok) {
    return json(
      {
        success: false,
        data: [],
        error: data
      },
      response.status
    );
  }

  return json({
    success: true,
    data: data
  });
}


// =====================================================
// MAIN CLOUDFLARE WORKER
// =====================================================

export default {
  async fetch(request, env) {
    // OPTIONS / CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // GET - cek backend aktif
    if (request.method === "GET") {
      return json({
        success: true,
        app: "PENA AI",
        status: "Backend aktif"
      });
    }

    // POST saja
    if (request.method !== "POST") {
      return json(
        {
          success: false,
          error: "Method tidak diizinkan."
        },
        405
      );
    }

    // Cek user Supabase
    let user;

    try {
      user = await getUser(request, env);
    } catch (error) {
      console.error("PENA AI AUTH ERROR:", error);
      return json(
        {
          success: false,
          error: error.message || "Gagal memeriksa sesi login."
        },
        500
      );
    }

    if (!user) {
      return json(
        {
          success: false,
          error: "Sesi login tidak valid. Silakan login kembali."
        },
        401
      );
    }

    // Baca body hanya sekali
    let body;

    try {
      body = await request.json();
    } catch (error) {
      return json(
        {
          success: false,
          error: "Data JSON tidak valid."
        },
        400
      );
    }

    const action = body?.action;

    // Routing
    try {
      switch (action) {
        case "write":
          return await tulisCepat(request, env, user, body);

        case "write_chapter":
          return await tulisBabBerikutnya(request, env, user, body);

        case "history":
          return await ambilRiwayat(request, env, user);

        default:
          return json(
            {
              success: false,
              error: "Action tidak dikenal: " + action
            },
            400
          );
      }
    } catch (error) {
      console.error("PENA AI ERROR:", error);

      return json(
        {
          success: false,
          saved: false,
          error: error.message || "Terjadi kesalahan pada backend."
        },
        500
      );
    }
  }
};
