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
Kamu adalah penulis novel profesional berbahasa Indonesia dan editor kontinuitas.
Tulis bab lanjutan yang terasa seperti novel sungguhan, bukan sinopsis.
Utamakan kesinambungan plot, karakter, hubungan, waktu, tempat, fakta kanon, sebab-akibat, emosi, dialog, dan kualitas prosa.
Gunakan Story Bible sebagai acuan resmi. Jangan membocorkan rahasia yang belum waktunya diketahui. Jangan membuat tokoh mengetahui hal yang belum ia ketahui. Jangan mengubah fakta atau sifat tanpa alasan cerita.
Jangan mengulang bab lama secara panjang, menyelesaikan konflik utama terlalu cepat, atau memperkenalkan tokoh/peristiwa besar tanpa alasan.
Pertahankan genre, nuansa, dan gaya penulisan novel.
Jangan tampilkan analisis, penjelasan, catatan AI, Markdown, outline, atau teks di luar format.
Keluaran wajib persis:
<JUDUL_BAB>
Judul orisinal 2–8 kata yang mencerminkan konflik, atmosfer, emosi, simbol, atau perkembangan bab; jangan generik atau meniru judul terkenal.
</JUDUL_BAB>
<ISI_BAB>
Prosa novel utuh dengan adegan, narasi, dialog, tindakan, dan perkembangan emosional.
</ISI_BAB>
Target isi 1.800–2.500 kata, ideal 2.000–2.200 kata. Akhiri adegan dan bab secara wajar dengan konsekuensi atau hook yang kuat. Hitung isi saja, bukan judul.
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
  // AMBIL STORY BIBLE / KANON NOVEL
  // ===================================================

  const storyBibleResponse = await fetch(
    `${env.SUPABASE_URL}/rest/v1/novel_story_bible?novel_id=eq.${encodeURIComponent(novelId)}&user_id=eq.${encodeURIComponent(user.id)}&select=world_description,world_rules,locations,factions,relationships,timeline,canon_facts,secrets,continuity_notes&limit=1`,
    {
      method: "GET",
      headers: supabaseHeaders
    }
  );

  const storyBibleResponseText = await storyBibleResponse.text();
  let storyBibleData;

  try {
    storyBibleData = storyBibleResponseText ? JSON.parse(storyBibleResponseText) : [];
  } catch (error) {
    throw new Error("Data Story Bible dari Supabase tidak dapat dibaca. Bab belum ditulis.");
  }

  if (!storyBibleResponse.ok) {
    throw new Error(
      storyBibleData?.message ||
      storyBibleData?.hint ||
      "Gagal mengambil Story Bible. Pastikan tabel novel_story_bible sudah dibuat melalui SQL setup. Bab belum ditulis."
    );
  }

  const storyBible = Array.isArray(storyBibleData) ? (storyBibleData[0] || null) : null;

  // ---------------------------------------------------
  // PENGAMAN UKURAN KONTEKS
  // Batas TPM Groq saat ini 8.000 token/menit. Karena tidak
  // tersedia tokenizer Groq di Worker, gunakan batas karakter
  // konservatif dan potong konteks yang paling kurang penting.
  // ---------------------------------------------------

  const potongKonteks = (value, maxChars, dariAkhir = false) => {
    const text = String(value || '').trim();
    if (text.length <= maxChars) return text;
    if (maxChars <= 24) return text.slice(0, maxChars);
    const penanda = '\n[…konteks dipadatkan…]\n';
    const sisa = Math.max(0, maxChars - penanda.length);
    return dariAkhir
      ? penanda + text.slice(-sisa)
      : text.slice(0, sisa) + penanda;
  };

  // ===================================================
  // STORY BIBLE — BATAS TOTAL, BUKAN 4.500 KARAKTER PER KOLOM
  // ===================================================

  const storyBibleSections = [
    ['DUNIA CERITA', 'world_description', 180],
    ['ATURAN DUNIA', 'world_rules', 230],
    ['FAKTA KANON', 'canon_facts', 280],
    ['CATATAN KONTINUITAS', 'continuity_notes', 250],
    ['RAHASIA / MISTERI', 'secrets', 220],
    ['HUBUNGAN ANTARTOKOH', 'relationships', 200],
    ['KRONOLOGI', 'timeline', 170],
    ['LOKASI PENTING', 'locations', 130],
    ['KELOMPOK / ORGANISASI', 'factions', 130]
  ];

  let sisaStoryBible = 1750;
  const potonganStoryBible = [];

  if (storyBible) {
    for (const [label, key, batasKolom] of storyBibleSections) {
      const value = String(storyBible[key] || '').trim();
      if (!value || sisaStoryBible <= 35) continue;

      const ruangNilai = Math.min(batasKolom, sisaStoryBible - label.length - 3);
      if (ruangNilai <= 20) continue;

      const ringkas = potongKonteks(value, ruangNilai);
      potonganStoryBible.push(`${label}: ${ringkas}`);
      sisaStoryBible -= label.length + ringkas.length + 3;
    }
  }

  const konteksStoryBible = potonganStoryBible.length
    ? potonganStoryBible.join('\n')
    : 'Story Bible belum diisi. Jangan mengarang fakta yang bertentangan dengan bab sebelumnya.';

  // ===================================================
  // KARAKTER — PROFIL UTAMA DIRINGKAS
  // ===================================================

  const profilKarakter = karakter.slice(0, 8).map(k => {
    const nama = potongKonteks(k.nama || 'Tanpa nama', 45);
    const peran = potongKonteks(k.peran || '', 45);
    const umur = potongKonteks(k.umur || '', 18);
    const sifat = potongKonteks(k.sifat || '', 65);
    const latar = potongKonteks(k.latar_belakang || '', 55);
    const hubungan = potongKonteks(k.hubungan || '', 55);
    const tujuan = potongKonteks(k.tujuan || '', 55);
    const rahasia = potongKonteks(k.rahasia || '', 50);
    const catatan = potongKonteks(k.catatan || '', 45);

    return [
      `${nama}${peran ? ` (${peran})` : ''}${umur ? `, usia ${umur}` : ''}`,
      sifat ? `Sifat: ${sifat}` : '',
      latar ? `Latar: ${latar}` : '',
      hubungan ? `Hubungan: ${hubungan}` : '',
      tujuan ? `Tujuan: ${tujuan}` : '',
      rahasia ? `Rahasia: ${rahasia}` : '',
      catatan ? `Catatan: ${catatan}` : ''
    ].filter(Boolean).join(' | ');
  });

  const konteksKarakter = karakter.length
    ? potongKonteks(profilKarakter.join('\n'), 1500)
    : 'Belum ada profil karakter tersimpan.';

  // ===================================================
  // KONTEKS BAB — BAB TERAKHIR LEBIH DIUTAMAKAN
  // ===================================================

  const babKonteks = babUntukKonteks.slice(-3);
  let konteksBab = 'Belum ada bab sebelumnya.';

  if (babKonteks.length) {
    const potonganBab = babKonteks.map((b, index) => {
      const isiSebelumnya = String(b.isi_bab || '').trim();
      const babTerbaruDalamKonteks = index === babKonteks.length - 1;
      const batasIsi = babTerbaruDalamKonteks ? 2350 : 300;
      const isiRingkas = potongKonteks(isiSebelumnya, batasIsi, true);
      return `BAB ${b.nomor_bab} — ${potongKonteks(b.judul_bab || '', 70)}\nCuplikan akhir: ${isiRingkas}`;
    });

    konteksBab = potongKonteks(potonganBab.join('\n\n'), 3000, true);
  }

  // ===================================================
  // RIWAYAT JUDUL — BATAS 350 KARAKTER
  // ===================================================

  const konteksJudul = babUntukKonteks.length
    ? potongKonteks(
        babUntukKonteks.slice(-8)
          .map(b => `Bab ${b.nomor_bab}: ${b.judul_bab || ''}`)
          .join(' | '),
        350
      )
    : 'Belum ada judul bab sebelumnya.';

  // ===================================================
  // INFORMASI NOVEL — BATAS 550 KARAKTER TOTAL
  // ===================================================

  let sisaInfoNovel = 550;
  const ambilInfoNovel = (value, batas) => {
    if (sisaInfoNovel <= 0) return '';
    const ringkas = potongKonteks(value || '', Math.min(batas, sisaInfoNovel));
    sisaInfoNovel -= ringkas.length;
    return ringkas;
  };

  const infoJudul = ambilInfoNovel(novel.judul, 100);
  const infoGenre = ambilInfoNovel(novel.genre || 'Drama', 60);
  const infoGaya = ambilInfoNovel(novel.gaya || 'Natural', 80);
  const infoNuansa = ambilInfoNovel(novel.nuansa || 'Emosional', 80);
  const infoMode = ambilInfoNovel(novel.mode || 'Normal', 40);
  const infoPremis = ambilInfoNovel(novel.premis || '', 190);

  // ===================================================
  // PROMPT BAB — RINGKAS, TETAP MENJAGA KONTINUITAS
  // ===================================================

  const userPrompt = `
LANJUTKAN NOVEL INI. Gunakan semua fakta penting di bawah sebagai kanon.

NOVEL: ${infoJudul}
GENRE: ${infoGenre} | GAYA: ${infoGaya} | NUANSA: ${infoNuansa} | MODE: ${infoMode}
PREMIS: ${infoPremis}
NOMOR BAB BARU: ${nomorBabBaru}

POLA JUDUL SEBELUMNYA:
${konteksJudul}

PROFIL KARAKTER (ringkas):
${konteksKarakter}

STORY BIBLE — FAKTA RESMI:
${konteksStoryBible}

KONTEKS BAB SEBELUMNYA (cuplikan akhir; bab paling baru diutamakan):
${konteksBab}

ATURAN PENULISAN:
- Tulis kelanjutan langsung; jangan mengulang bab lama.
- Patuhi Story Bible dan fakta bab sebelumnya. Jangan ubah usia, waktu, lokasi, hubungan, luka, benda, janji, atau fakta kanon.
- Tokoh hanya boleh bertindak berdasarkan hal yang telah diketahuinya. Jangan membocorkan rahasia sebelum waktunya.
- Pertahankan karakter, hubungan, genre, nuansa, dan gaya. Bangun konflik serta emosi secara bertahap dan masuk akal.
- Gunakan adegan utuh, narasi, tindakan, dialog natural, dan detail suasana. Jangan membuat sinopsis atau outline.
- Jangan menyelesaikan konflik utama terlalu cepat. Akhiri bab dengan penutup yang wajar dan hook/konsekuensi yang kuat.
- Target isi 1.800–2.500 kata, ideal 2.000–2.200 kata. Jangan mengorbankan kualitas demi jumlah kata.
- Buat judul baru 2–8 kata yang sesuai genre, konflik, emosi, atmosfer, simbol, dan perkembangan bab; hindari judul generik atau meniru judul terkenal.

KELUARAN WAJIB HANYA:
<JUDUL_BAB>
Judul bab
</JUDUL_BAB>
<ISI_BAB>
Isi novel lengkap
</ISI_BAB>
`;

  // Estimasi konservatif untuk mencegah prompt kembali melampaui TPM.
  // Batas 11.500 karakter untuk instruksi + konteks (sekitar 3.600–3.900 token,
  // bergantung tokenizer). Sisa TPM disediakan untuk keluaran bab.
  const ukuranPromptKarakter = NOVEL_CHAPTER_SYSTEM_PROMPT.length + userPrompt.length;
  if (ukuranPromptKarakter > 11500) {
    throw new Error(
      `Konteks novel masih terlalu panjang (${ukuranPromptKarakter} karakter). Bab belum dikirim ke Groq dan tidak disimpan. Ringkas Story Bible atau profil karakter, lalu coba kembali.`
    );
  }

  // ===================================================
  // PANGGIL GROQ - SATU KALI SAJA
  // ===================================================

  const hasilMentah = await callGroq(
    NOVEL_CHAPTER_SYSTEM_PROMPT,
    userPrompt,
    env,
    4200
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
