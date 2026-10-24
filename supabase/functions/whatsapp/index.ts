// WhatsApp Cloud API <-> Rosmatic chat function

const V = Deno.env.get("WHATSAPP_API_VERSION") ?? "v25.0";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
const VERIFY = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const SEND_KEY = Deno.env.get("WHATSAPP_SEND_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

// Send any message through the WhatsApp Cloud API
async function wa(body: Record<string, unknown>) {
  const res = await fetch(`https://graph.facebook.com/${V}/${PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  const data = await res.json();
  if (!res.ok) console.error("WhatsApp send error", JSON.stringify(data));
  return { status: res.status, data };
}

// Ask the existing "chat" function for a reply
async function askChat(userText: string): Promise<string> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: userText }] }),
      signal: AbortSignal.timeout(25000),
    });
    const data = await res.json();
    if (!res.ok || !data?.reply) throw new Error(JSON.stringify(data));
    return data.reply;
  } catch (e) {
    console.error("chat error", e);
    return "Sorry, I cannot reply right now. Please call the clinic on +92 320 6800388.";
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Meta webhook verification
  if (req.method === "GET") {
    if (
      url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === VERIFY
    ) {
      return new Response(url.searchParams.get("hub.challenge"), { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.json();

  // Manual test send: POST { "to": "923XXXXXXXXX", "text": "optional" }
  if (body.to) {
    if (req.headers.get("x-api-key") !== SEND_KEY) {
      return new Response("Unauthorized", { status: 401 });
    }
    const payload = body.text
      ? { to: body.to, type: "text", text: { body: body.text } }
      : {
          to: body.to,
          type: "template",
          template: { name: "hello_world", language: { code: "en_US" } },
        };
    const r = await wa(payload);
    return Response.json(r.data, { status: r.status });
  }

  // Incoming message from Meta webhook
  const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (msg?.type === "text") {
    const work = (async () => {
      const reply = await askChat(msg.text.body);
      await wa({ to: msg.from, type: "text", text: { body: reply } });
    })();
    // Reply 200 to Meta immediately, send the answer in the background
    // @ts-ignore: Supabase Edge runtime
    EdgeRuntime.waitUntil(work);
  }

  return new Response("ok", { status: 200 });
});