
export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "https://pena-ai-engine.pages.dev",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const headers = {
      ...corsHeaders,
      "Content-Type": "application/json"
    };

    if (request.method !== "POST") {
      return Response.json(
        { error: "Gunakan metode POST." },
        { status: 405, headers }
      );
    }

    try {
      if (!env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY belum diatur.");
      }

      const body = await request.json();
      const prompt = body.prompt || body.text;

      if (!prompt || !String(prompt).trim()) {
        return Response.json(
          { error: "Tuliskan perintah terlebih dahulu." },
          { status: 400, headers }
        );
      }

      const response = await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: env.OPENAI_MODEL || "gpt-6.1-terra",
            input: String(prompt)
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        return Response.json(
          { error: result.error?.message || "AI gagal memproses." },
          { status: response.status, headers }
        );
      }

      const output = result.output
        ?.flatMap(item => item.content || [])
        ?.filter(item => item.type === "output_text")
        ?.map(item => item.text)
        ?.join("\n") || "";

      return Response.json(
        { success: true, text: output },
        { headers }
      );

    } catch (error) {
      return Response.json(
        { success: false, error: error.message },
        { status: 500, headers }
      );
    }
  }
};
