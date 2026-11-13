
const cors = {
  "Access-Control-Allow-Origin": "https://pena-ai-engine.pages.dev",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export default {
  async fetch(request, env) {
    const headers = {
      ...cors,
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method === "GET") {
      return Response.json({
        success: true,
        app: "PENA AI",
        status: "Backend aktif"
      }, { headers });
    }

    if (request.method !== "POST") {
      return Response.json(
        { error: "Gunakan metode POST." },
        { status: 405, headers }
      );
    }

    try {
      const url = env.SUPABASE_URL;
      const anonKey = env.SUPABASE_ANON_KEY;
      const apiKey = env.GROQ_API_KEY;
      const model = "openai/gpt-oss-120b";

      const missing = [];

if (!url) missing.push("SUPABASE_URL");
if (!anonKey) missing.push("SUPABASE_ANON_KEY");
if (!apiKey) missing.push("GROQ_API_KEY");
if (!model) missing.push("GROQ_MODEL");

if (missing.length) {
  return Response.json({
    success: false,
    error: "Konfigurasi belum terbaca: " + missing.join(", ")
  }, { status: 500, headers });
}

      const authHeader = request.headers.get("Authorization");

      if (!authHeader?.startsWith("Bearer ")) {
        return Response.json(
          { error: "Silakan login terlebih dahulu." },
          { status: 401, headers }
        );
      }

      const token = authHeader.slice(7);

      // Verifikasi akun Supabase
      const authResponse = await fetch(
        `${url}/auth/v1/user`,
        {
          headers: {
            "apikey": anonKey,
            "Authorization": `Bearer ${token}`
          }
        }
      );

      if (!authResponse.ok) {
        return Response.json(
          { error: "Sesi login tidak valid." },
          { status: 401, headers }
        );
      }

      const user = await authResponse.json();
      const body = await request.json();

      const prompt = body.prompt || body.text;

      if (!prompt || !String(prompt).trim()) {
        return Response.json(
          { error: "Perintah penulisan masih kosong." },
          { status: 400, headers }
        );
      }
      // Proses penulisan AI
      const aiResponse = await fetch(
        "https://api.groq.com/openai/v1/responses",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            input: String(prompt)
          })
        }
      );

      const aiResult = await aiResponse.json();

      if (!aiResponse.ok) {
        throw new Error(
          aiResult.error?.message || "OpenAI gagal memproses."
        );
      }

      const hasil = aiResult.output
        ?.flatMap(item => item.content || [])
        ?.filter(item => item.type === "output_text")
        ?.map(item => item.text)
        ?.join("\n") || "";

      if (!hasil) {
        throw new Error("AI tidak menghasilkan tulisan.");
      }

      // Simpan riwayat tulisan
      const saveHistory = await fetch(
        `${url}/rest/v1/riwayat_penulisan`,
        {
          method: "POST",
          headers: {
            "apikey": anonKey,
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({
            user_id: user.id,
            judul: body.judul || "Tulisan Baru",
            perintah: String(prompt),
            hasil_tulisan: hasil,
            model_ai: model
          })
        }
      );

      if (!saveHistory.ok) {
        throw new Error("Gagal menyimpan riwayat tulisan.");
      }

      // Catat penggunaan AI
      const saveUsage = await fetch(
        `${url}/rest/v1/penggunaan_ai`,
        {
          method: "POST",
          headers: {
            "apikey": anonKey,
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({
            user_id: user.id,
            jenis_tulisan: body.jenis || "Umum",
            jumlah_karakter: hasil.length,
            model_ai: model,
            status: "berhasil"
          })
        }
      );

      if (!saveUsage.ok) {
        throw new Error("Gagal mencatat penggunaan AI.");
      }

      return Response.json({
        success: true,
        text: hasil,
        model: model,
        message: "Tulisan berhasil dibuat dan disimpan."
      }, { headers });

    } catch (error) {
      return Response.json({
        success: false,
        error: error.message
      }, { status: 500, headers });
    }
  }
};
