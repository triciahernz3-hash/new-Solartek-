import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import {
  getLeadsFromFirebase,
  saveLeadToFirebase,
  deleteLeadFromFirebase,
  getImagesFromFirebase,
  saveImagesToFirebase,
  getMaintenanceModeFromFirebase,
  saveMaintenanceModeToFirebase,
} from "./src/lib/firebase";

dotenv.config();

// Helper to send a beautifully-styled email for a new lead
async function sendLeadEmail(lead: any) {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = parseInt(process.env.SMTP_PORT || "465", 10);
  const notificationEmail = process.env.NOTIFICATION_EMAIL || "trishmarie002@gmail.com";
  const formspreeUrl = "https://formspree.io/f/mpqgezvq";

  console.log(`[Email Dispatcher] Attempting to process email dispatch for lead: ${lead.name}`);

  // 1. ALWAYS dispatch to Formspree endpoint as requested
  let formspreeSuccess = false;
  try {
    console.log(`[Formspree Dispatcher] Forwarding lead submission to Formspree: ${formspreeUrl}`);
    
    const payload: any = {
      "Full Name": lead.name,
      "Phone Number": lead.phone,
      "Email Address": lead.email || "N/A",
      "Requested Service": lead.service || "General Pool Sizing",
      "Lead Source": lead.source || "Direct Form Submit",
      "Estimated Area (Sqft) / Pool Size": lead.poolType || lead.sqft || "N/A",
      "Monthly Utility Bill": lead.currentBill || "N/A",
      "Client Message": lead.message || "No custom message provided.",
    };

    if (lead.calculatorResults) {
      payload["Quiz Match Score"] = `${lead.calculatorResults.score}%`;
      payload["Quiz Recommendation"] = lead.calculatorResults.title;
      payload["Quiz Description"] = lead.calculatorResults.sub;
      payload["Estimated Annual Savings"] = lead.calculatorResults.savings;
      payload["Carbon Footprint Reduction"] = lead.calculatorResults.carbon;
      payload["Estimated ROI Payback Period"] = lead.calculatorResults.roi;
      payload["Daily Sun Exposure"] = lead.calculatorResults.sunExposure || "N/A";
    }

    const response = await fetch(formspreeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log(`✅ [Formspree Dispatcher] Lead dispatched successfully to Formspree!`);
      formspreeSuccess = true;
    } else {
      const errorText = await response.text();
      console.error(`❌ [Formspree Dispatcher] Formspree dispatch returned an error: ${response.status} - ${errorText}`);
    }
  } catch (formspreeErr) {
    console.error("❌ [Formspree Dispatcher] Failed to dispatch email via Formspree:", formspreeErr);
  }

  // 2. Also send SMTP email if SMTP is configured, as an extra layer of backup
  if (!smtpUser || !smtpPass) {
    return formspreeSuccess;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const isQuiz = !!lead.calculatorResults;
    const subjectPrefix = isQuiz ? "📊 QUIZ CALCULATOR LEAD" : "✉️ CONTACT FORM LEAD";

    const mailOptions = {
      from: `"Solar Tek Texas" <${smtpUser}>`,
      to: notificationEmail,
      subject: `[Solar Tek] ${subjectPrefix}: ${lead.name}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Solar Lead Captured</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #0c0a09; color: #f5f5f4; margin: 0; padding: 15px; -webkit-font-smoothing: antialiased; }
    .card { background-color: #1c1917; border: 1px solid #292524; border-radius: 16px; padding: 24px; max-width: 580px; margin: 0 auto; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4); }
    .header { text-align: center; border-bottom: 2px solid #eab308; padding-bottom: 16px; margin-bottom: 20px; }
    .title { color: #ffffff; font-size: 22px; font-weight: 900; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }
    .subtitle { color: #eab308; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; margin: 6px 0 0 0; }
    .section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; color: #78716c; letter-spacing: 1.5px; border-bottom: 1px solid #292524; padding-bottom: 6px; margin-top: 24px; margin-bottom: 12px; }
    .item { background-color: #0c0a09; border: 1px solid #292524; padding: 12px 16px; border-radius: 10px; margin-bottom: 10px; }
    .label { font-size: 9px; text-transform: uppercase; color: #a8a29e; font-weight: 800; letter-spacing: 0.75px; margin-bottom: 4px; }
    .value { font-size: 14px; color: #ffffff; font-weight: 700; }
    .message-box { background-color: #0c0a09; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 0 10px 10px 0; font-size: 13px; color: #e7e5e4; line-height: 1.5; margin-top: 8px; border-top: 1px solid #292524; border-bottom: 1px solid #292524; border-right: 1px solid #292524; }
    .quiz-card { background-color: rgba(234, 179, 8, 0.04); border: 1px solid rgba(234, 179, 8, 0.15); border-radius: 12px; padding: 16px; margin-top: 14px; }
    .quiz-header { border-bottom: 1px dashed rgba(234, 179, 8, 0.15); padding-bottom: 8px; margin-bottom: 12px; display: block; }
    .quiz-title { font-size: 12px; font-weight: 800; color: #facc15; text-transform: uppercase; tracking: 0.5px; }
    .quiz-score { font-size: 10px; background-color: rgba(234, 179, 8, 0.15); color: #fef08a; padding: 3px 8px; border-radius: 6px; font-weight: 800; float: right; margin-top: -2px; }
    .grid-row { display: flex; flex-direction: row; gap: 10px; margin-bottom: 10px; }
    .grid-col { flex: 1; }
    .footer { text-align: center; margin-top: 28px; font-size: 10px; color: #57534e; line-height: 1.4; letter-spacing: 0.5px; }
    @media (max-width: 480px) {
      .grid-row { flex-direction: column; gap: 10px; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="title">Solar Tek Energy</div>
      <div class="subtitle">☀️ Texas Sizing Lead Alert</div>
    </div>
    
    <div class="section-title">Contact & Client Details</div>
    <div class="item">
      <div class="label">Full Name</div>
      <div class="value" style="font-size: 16px; color: #facc15;">${lead.name}</div>
    </div>
    
    <div class="grid-row">
      <div class="grid-col">
        <div class="item">
          <div class="label">Phone Number</div>
          <div class="value">${lead.phone}</div>
        </div>
      </div>
      <div class="grid-col">
        <div class="item">
          <div class="label">Email Address</div>
          <div class="value">${lead.email || "N/A"}</div>
        </div>
      </div>
    </div>

    <div class="section-title">System Sizing Specs</div>
    <div class="grid-row">
      <div class="grid-col">
        <div class="item">
          <div class="label">Desired Service</div>
          <div class="value">${lead.service || "General Pool Sizing"}</div>
        </div>
      </div>
      <div class="grid-col">
        <div class="item">
          <div class="label">Lead Origin Source</div>
          <div class="value">${lead.source || "Direct Form Submit"}</div>
        </div>
      </div>
    </div>

    <div class="grid-row">
      <div class="grid-col">
        <div class="item">
          <div class="label">Estimated Area (Sqft) / Pool size</div>
          <div class="value">${lead.sqft || lead.poolType || "N/A"}</div>
        </div>
      </div>
      <div class="grid-col">
        <div class="item">
          <div class="label">Monthly Utility Bill</div>
          <div class="value">${lead.currentBill || "N/A"}</div>
        </div>
      </div>
    </div>

    ${lead.calculatorResults ? `
    <div class="quiz-card">
      <div class="quiz-header">
        <span class="quiz-score">Score Compatibility: ${lead.calculatorResults.score}%</span>
        <span class="quiz-title">📊 Dynamic Calculator Results</span>
      </div>
      <div style="font-size: 14px; font-weight: 800; color: #ffffff; margin-bottom: 4px;">
        ${lead.calculatorResults.title}
      </div>
      <div style="font-size: 11px; color: #a8a29e; margin-bottom: 12px; font-style: italic; line-height: 1.4;">
        ${lead.calculatorResults.sub}
      </div>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
        <div style="background-color: #0c0a09; padding: 10px; border-radius: 8px; border: 1px solid #292524;">
          <div class="label" style="font-size: 8px; margin-bottom: 2px;">Estimated Savings</div>
          <div class="value" style="font-size: 13px; color: #facc15;">${lead.calculatorResults.savings}</div>
        </div>
        <div style="background-color: #0c0a09; padding: 10px; border-radius: 8px; border: 1px solid #292524;">
          <div class="label" style="font-size: 8px; margin-bottom: 2px;">Carbon Reduction</div>
          <div class="value" style="font-size: 13px; color: #e7e5e4;">${lead.calculatorResults.carbon}</div>
        </div>
        <div style="background-color: #0c0a09; padding: 10px; border-radius: 8px; border: 1px solid #292524;">
          <div class="label" style="font-size: 8px; margin-bottom: 2px;">ROI payback Period</div>
          <div class="value" style="font-size: 13px; color: #e7e5e4;">${lead.calculatorResults.roi}</div>
        </div>
        <div style="background-color: #0c0a09; padding: 10px; border-radius: 8px; border: 1px solid #292524;">
          <div class="label" style="font-size: 8px; margin-bottom: 2px;">Solar Sun Exposure</div>
          <div class="value" style="font-size: 13px; color: #e7e5e4;">${lead.calculatorResults.sunExposure || "N/A"}</div>
        </div>
      </div>
    </div>
    ` : ""}

    <div class="section-title">Client Message</div>
    <div class="message-box">
      ${lead.message || "No custom message provided."}
    </div>

    <div class="footer">
      This notification was automatically routed by Solar Tek Energy of Texas.<br>
      Dispatch Registry Dashboard • Confidential Client Data
    </div>
  </div>
</body>
</html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ [Email Dispatcher] Email successfully delivered. Message ID: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error("❌ [Email Dispatcher] Failed to deliver notification email:", err);
    return false;
  }
}

const app = express();
const PORT = 3000;
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));

// Ensure uploads folder exists in working directory
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve uploads folder statically
app.use("/uploads", express.static(UPLOADS_DIR));

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
} else {
  console.warn("GEMINI_API_KEY is not defined in environment variables.");
}

// Helper to verify Firebase ID Token using Google Identity Toolkit API
async function verifyFirebaseToken(idToken: string) {
  try {
    const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (!fs.existsSync(firebaseConfigPath)) return null;
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
    const apiKey = firebaseConfig.apiKey;
    if (!apiKey) return null;

    const verificationUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`;
    const response = await fetch(verificationUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.users?.[0] || null;
  } catch (err) {
    console.error("Error verifying ID token:", err);
    return null;
  }
}

// Admin Protection Middleware using Firebase ID Token
async function requireFirebaseAdmin(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }
  const token = authHeader.split(" ")[1];
  const user = await verifyFirebaseToken(token);
  if (!user) {
    return res.status(403).json({ success: false, error: "Invalid or expired Firebase session" });
  }
  
  const email = user.email ? user.email.toLowerCase() : "";
  const ADMIN_GMAIL = (process.env.ADMIN_GMAIL || "trishmarie002@gmail.com").toLowerCase();
  
  if (email === ADMIN_GMAIL) {
    req.adminUser = user;
    return next();
  }
  
  return res.status(403).json({ success: false, error: "Gmail account is not authorized as an administrator" });
}

app.get("/api/maintenance/status", async (req, res) => {
  const enabled = await getMaintenanceModeFromFirebase();
  res.json({ success: true, enabled });
});

app.post("/api/maintenance/toggle", requireFirebaseAdmin, async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ success: false, error: "enabled (boolean) is required" });
  }
  await saveMaintenanceModeToFirebase(enabled);
  res.json({ success: true, enabled });
});

// GET dynamic image coordinates
app.get("/api/images", async (req, res) => {
  let images = await getImagesFromFirebase();
  if (!images || Object.keys(images).length === 0) {
    try {
      const defaultImagesPath = path.join(process.cwd(), "images_config.json");
      if (fs.existsSync(defaultImagesPath)) {
        const raw = fs.readFileSync(defaultImagesPath, "utf-8");
        images = JSON.parse(raw);
        await saveImagesToFirebase(images);
      }
    } catch (e) {
      console.error("Error fallback loading images_config.json:", e);
    }
  }
  res.json({ success: true, images });
});

// POST upload an image file (Admin Protected)
// Receives { filename: string, base64: string }
app.post("/api/images/upload", requireFirebaseAdmin, (req, res) => {
  const { filename, base64 } = req.body;
  
  if (!filename || !base64) {
    return res.status(400).json({ success: false, error: "filename and base64 string are required." });
  }

  try {
    // Strip base64 file headers if present
    const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    
    // Create a clean safe unique filename
    const fileExt = path.extname(filename);
    const fileBase = path.basename(filename, fileExt).replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeFilename = `${fileBase}_${Date.now()}${fileExt}`;
    
    const filePath = path.join(process.cwd(), "public", "uploads", safeFilename);
    fs.writeFileSync(filePath, buffer);
    
    const absoluteSourceUrl = `/uploads/${safeFilename}`;
    return res.json({ success: true, url: absoluteSourceUrl });
  } catch (err: any) {
    console.error("Upload failed in API: ", err);
    return res.status(500).json({ success: false, error: "Image file write failed: " + err.message });
  }
});

// POST update images (Admin Protected)
app.post("/api/images", requireFirebaseAdmin, async (req, res) => {
  const { images } = req.body;
  if (!images || typeof images !== "object") {
    return res.status(400).json({ success: false, error: "images (object) is required." });
  }
  const current = await getImagesFromFirebase();
  const updated = { ...current, ...images };
  await saveImagesToFirebase(updated);
  res.json({ success: true, images: updated });
});

// GET leads (Admin Protected)
app.get("/api/leads", requireFirebaseAdmin, async (req, res) => {
  const leads = await getLeadsFromFirebase();
  res.json({ success: true, leads });
});

// POST lead
app.post("/api/leads", async (req, res) => {
  const { name, phone, email, service, message, source, sqft, poolType, currentBill, calculatorResults } = req.body;
  
  if (!name || !phone) {
    return res.status(400).json({ success: false, error: "Name and Phone are required." });
  }

  const newLead = {
    id: "lead_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    name,
    phone,
    email: email || "N/A",
    service: service || "General Quote",
    message: message || "Interested in a consultation",
    source: source || "Instant Quote Form",
    sqft: sqft || "",
    poolType: poolType || "",
    currentBill: currentBill || "",
    calculatorResults: calculatorResults || null,
    createdAt: new Date().toISOString(),
  };

  try {
    await saveLeadToFirebase(newLead);
  } catch (dbErr) {
    console.error("Failed to save lead to Firebase database:", dbErr);
  }

  // Dispatch email notification asynchronously so it doesn't block lead confirmation
  sendLeadEmail(newLead).catch((mailErr) => {
    console.error("Failed to dispatch lead notification email:", mailErr);
  });

  res.json({ success: true, lead: newLead });
});

// DELETE lead (Admin Protected)
app.delete("/api/leads/:id", requireFirebaseAdmin, async (req, res) => {
  const { id } = req.params;
  await deleteLeadFromFirebase(id);
  res.json({ success: true, message: "Lead removed" });
});


// AI Chatbot Route with automatic Lead Detection
app.post("/api/chat", async (req, res) => {
  const { messages } = req.body; // Array of { role: 'user' | 'model', parts: [{ text: string }] }

  if (!ai) {
    return res.json({
      success: true,
      text: "Howdy! I am Tex from Solar Tek Energy Texas. Our AI Service is offline at the moment, but please give us a call direct at 210-826-1121 and we can get you a high-performance quote right away!",
    });
  }

  try {
    const formattedMessages = messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : m.role,
      parts: m.parts || [{ text: m.text }],
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: formattedMessages,
      config: {
        systemInstruction: `You are 'Tex', the legendary, high-octane, friendly AI Assistant for 'Solar Tek Energy Texas' (Contact Number: 210-826-1121). 
Your tone is welcoming, highly knowledgeable, professional, and bold (Texas sizing!). You speak with proud Texas hospitality ("Howdy!", "Y'all", "Blessed Texas Sun").
We specialize in:
- Solar Pool Heating Systems (Heliocol Certified — warm pool waters to a perfect 82°F–88°F for a 10-month swim season!)
- Solar Hot Water Systems (Flat-plate thermal collectors to replace expensive hot water electricity or gas bills!)
- Solar PV Systems (State-of-the-art solar panels for full home electric offset with zero financing!)
- All Solar Repairs and Maintenance (Certified storm/hail recovery, leak re-sealing, system diagnostics statewide!)

YOUR MISSION:
1. Answer their questions confidently and clearly. Ensure pricing claims mention we accept direct purchases or home storm insurance coverage (no finance). Our SEO scope covers ALL of Texas (statewide servicing), headquartered in San Antonio.
2. Politely and naturally steer the conversation to capture:
   - Their Name
   - Phone Number
   - Email Address
   - Their specific Solar need/interest
3. Once you have successfully gathered their Name and Phone, you MUST silently append a structured lead tag to the VERY END of your reply, on its own line. Do not tell the user you are adding a tag.
   The tag MUST look exactly like this:
   LEAD_CAPTURED: {"name": "GATHERED_NAME", "phone": "GATHERED_PHONE", "email": "GATHERED_EMAIL", "interest": "GATHERED_INTEREST"}

   Substitute the gathered values. If they didn't provide email or interest, write "N/A" for those. Keep the greeting natural for them. Keep chats punchy and readable!`,
      },
    });

    let text = response.text || "Howdy! I had a connection hiccup, but let's keep talking. How can I help you solar-power your pool or home today?";

    // Detect if a lead has been captured
    const leadMatch = text.match(/LEAD_CAPTURED:\s*({.+})/);
    let capturedLead = null;

    if (leadMatch) {
      try {
        capturedLead = JSON.parse(leadMatch[1]);
        // Strip the lead tag from the response text so the user doesn't see it
        text = text.replace(/LEAD_CAPTURED:\s*{.+}/, "").trim();

        // Save lead automatically to our list
        const newLead = {
          id: "lead_chat_" + Date.now(),
          name: capturedLead.name,
          phone: capturedLead.phone,
          email: capturedLead.email || "N/A",
          service: capturedLead.interest || "AI Chat Intake",
          message: "Lead captured automatically via custom Tex Chatbot conversation.",
          source: "Tex AI Chatbot",
          createdAt: new Date().toISOString(),
        };

        await saveLeadToFirebase(newLead);
        console.log("Successfully logged auto lead from AI Chat to Firebase:", newLead);
        
        // Dispatch to Formspree
        sendLeadEmail(newLead).catch((mailErr) => {
          console.error("Failed to dispatch chatbot lead notification to Formspree:", mailErr);
        });
      } catch (parseErr) {
        console.error("Error parsing automatic lead from AI text:", parseErr);
      }
    }

    res.json({
      success: true,
      text: text,
      leadCaptured: !!capturedLead,
    });
  } catch (err: any) {
    console.error("Gemini Chat API Error:", err);
    res.status(500).json({
      success: false,
      error: err.message,
      text: "Howdy! I ran into an estimation glitch. Let's talk about solar pool heating or home power! Feel free to dial us at 210-826-1121 anytime.",
    });
  }
});

// SITEMAP & SEO SEARCH CRAWLER ENDPOINTS
app.get("/sitemap.xml", (req, res) => {
  const host = req.get("host") || "solartekenergytexas.com";
  const protocol = req.headers["x-forwarded-proto"] === "https" || req.secure ? "https" : "http";
  const baseUrl = `${protocol}://${host}`;
  const currentDate = new Date().toISOString().split("T")[0];

  res.header("Content-Type", "application/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/#hero</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/#about</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/#get_quote_block</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>`);
});

app.get("/robots.txt", (req, res) => {
  const host = req.get("host") || "solartekenergytexas.com";
  const protocol = req.headers["x-forwarded-proto"] === "https" || req.secure ? "https" : "http";
  const baseUrl = `${protocol}://${host}`;

  res.header("Content-Type", "text/plain");
  res.send(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin

Sitemap: ${baseUrl}/sitemap.xml`);
});

// Setup Vite / Serve Static Build
async function startServer() {
  // Ultra-robust dist directory resolution
  let distPath = path.join(process.cwd(), "dist");
  
  // If dist/index.html doesn't exist, check if we are already inside the dist directory
  if (!fs.existsSync(path.join(distPath, "index.html"))) {
    if (fs.existsSync(path.join(process.cwd(), "index.html"))) {
      distPath = process.cwd();
    }
  }

  const distExists = fs.existsSync(path.join(distPath, "index.html"));

  console.log(`[Diagnostic] process.cwd(): ${process.cwd()}`);
  console.log(`[Diagnostic] Resolved distPath of fallback index.html to: ${distPath}`);
  console.log(`[Diagnostic] index.html exists in that path: ${distExists}`);

  let useStatic = distExists;
  let viteInstance: any = null;

  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import("vite");
      viteInstance = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      useStatic = false;
    } catch (err) {
      console.log("Vite is not available in development. Falling back to static assets server.");
      useStatic = true;
    }
  }

  // Mount Vite development middlewares or Static compiled production assets first!
  // This allows static assets (like JS, CSS, images, hot-reloads) to be served seamlessly.
  if (viteInstance) {
    app.use(viteInstance.middlewares);
  } else if (useStatic && distExists) {
    app.use(express.static(distPath));
  }

  // API requests that did not match any handled route will return a clean API 404
  app.use("/api/*", (req, res) => {
    res.status(404).json({ success: false, error: "API route not found" });
  });

  // Unified SPA routing for all direct page loads & refreshes (e.g., /, /admin, /city/houston)
  app.get("*", async (req, res, next) => {
    const urlPath = req.path;

    // Skip handling files with physical extensions (if any reached here, they are missing/404 assets)
    const ext = path.extname(urlPath);
    if (ext && ext !== ".html") {
      return res.status(404).send("Asset not found");
    }

    // Serve index.html with Vite's HTML transform in development mode
    if (viteInstance) {
      try {
        const indexPath = path.join(process.cwd(), "index.html");
        let template = fs.readFileSync(indexPath, "utf-8");
        template = await viteInstance.transformIndexHtml(req.originalUrl, template);
        return res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (err: any) {
        viteInstance.ssrFixStacktrace(err as Error);
        return next(err);
      }
    }

    // Serve the static compiled index.html file in production mode
    if (distExists) {
      const indexPath = path.join(distPath, "index.html");
      return res.sendFile(indexPath, (err) => {
        if (err) {
          console.error(`Error serving index.html for SPA route ${urlPath}:`, err);
          res.status(500).send("Unable to load index.html. Please refresh or contact support.");
        }
      });
    }

    return res.status(404).send("Page not found");
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Solar Tek Texas Full Stack backend running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
