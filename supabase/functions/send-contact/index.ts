import nodemailer from "npm:nodemailer@6.9.16";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*", // production mein apna domain likho
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const b = await req.json();
    const fullName = String(b.fullName ?? "").trim();
    const email = String(b.email ?? "").trim();
    const phone = String(b.phone ?? "").trim();
    const treatment = String(b.treatment ?? "").trim();
    const message = String(b.message ?? "").trim();

    if (!fullName || !email || !phone || !message) return json({ error: "Please fill all required fields." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Invalid email address." }, 400);
    if (fullName.length > 100 || message.length > 2000) return json({ error: "Input too long." }, 400);

    // 1) DB mein save
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error: dbError } = await supabase
      .from("contact_messages")
      .insert({ full_name: fullName, email, phone, treatment: treatment || null, message });
    if (dbError) throw dbError;

    // 2) Admin ko email
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      auth: { user: Deno.env.get("SMTP_USER")!, pass: Deno.env.get("SMTP_PASS")! },
    });

    await transporter.sendMail({
      from: `"Rosmatic Website" <${Deno.env.get("SMTP_USER")}>`,
      to: Deno.env.get("ADMIN_EMAIL")!,
      replyTo: `"${fullName.replace(/"/g, "")}" <${email}>`,
      subject: `New inquiry from ${fullName}`,
      text: `Name: ${fullName}\nEmail: ${email}\nPhone: ${phone}\nInterested in: ${treatment || "-"}\n\nMessage:\n${message}`,
      html: `
        <h2>New website inquiry</h2>
        <p><b>Name:</b> ${esc(fullName)}</p>
        <p><b>Email:</b> ${esc(email)}</p>
        <p><b>Phone:</b> ${esc(phone)}</p>
        <p><b>Interested in:</b> ${esc(treatment || "-")}</p>
        <p><b>Message:</b><br>${esc(message).replace(/\n/g, "<br>")}</p>`,
    });

    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});