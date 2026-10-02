const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const app = express();
app.use(express.json({ limit: '20mb' }));
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);
const model = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').replace(/^models\//, '');

// Serve only public files, never API keys or server source.
for (const [url, file] of [['/', 'index.html'], ['/index.html', 'index.html'], ['/script.js', 'script.js'], ['/style.css', 'style.css']]) {
  app.get(url, (req, res) => res.sendFile(path.join(__dirname, file)));
}
app.get('/api/config', (req, res) => res.json({
  configured: Boolean(process.env.GEMINI_API_KEY),
  images: { maxCount: MAX_IMAGES, maxBytes: MAX_IMAGE_BYTES, mimeTypes: [...IMAGE_TYPES] }
}));
app.post('/api/ai', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'กรุณาใส่ GEMINI_API_KEY ในไฟล์ .env แล้วรันเซิร์ฟเวอร์ใหม่' });
  const { prompt, messages, images = [], json = false } = req.body || {};
  if (!Array.isArray(images) || images.length > MAX_IMAGES) return res.status(400).json({ error: `ส่งรูปได้ครั้งละไม่เกิน ${MAX_IMAGES} รูป` });
  if (messages !== undefined && (!Array.isArray(messages) || !messages.length || messages.length > 16 || messages.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim()))) {
    return res.status(400).json({ error: 'รูปแบบประวัติสนทนาไม่ถูกต้อง' });
  }
  if (!messages && (typeof prompt !== 'string' || !prompt.trim())) return res.status(400).json({ error: 'กรุณาระบุคำถาม' });
  const contents = messages ? messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) : [{ role: 'user', parts: [{ text: prompt }] }];
  for (const img of images) {
    if (!img || !IMAGE_TYPES.has(img.mimeType) || typeof img.data !== 'string' || !img.data || !/^[A-Za-z0-9+/]*={0,2}$/.test(img.data) || Buffer.byteLength(img.data, 'base64') > MAX_IMAGE_BYTES) {
      return res.status(400).json({ error: 'รูปต้องเป็น PNG, JPEG, WebP, HEIC หรือ HEIF และขนาดไม่เกิน 3 MB', code: 'image_rejected' });
    }
    contents[contents.length - 1].parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 8192, ...(json ? { responseMimeType: 'application/json' } : {}) } }),
      signal: controller.signal
    });
    const result = await response.json();
    if (!response.ok) {
      const details = String(result.error?.message || 'Gemini API error').split(apiKey).join('[hidden]');
      const hint = response.status === 429 ? 'Gemini ใช้งานเกินโควตา กรุณาลองใหม่ภายหลัง' : response.status === 404 ? 'ไม่พบโมเดล กรุณาตรวจ GEMINI_MODEL ใน .env' : response.status === 400 || response.status === 403 ? 'ตรวจสอบ Gemini API key และสิทธิ์ใช้งานโมเดล' : 'Gemini ไม่สามารถตอบได้';
      return res.status(response.status >= 400 && response.status <= 599 ? response.status : 502).json({ error: `${hint}: ${details}`, ...(response.status === 429 ? { code: 'rate_limited' } : {}) });
    }
    const candidate = result.candidates?.[0];
    const text = (candidate?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
    if (!text || candidate?.finishReason === 'MAX_TOKENS') return res.status(502).json({ error: 'Gemini ตอบไม่ครบหรือไม่มีข้อความตอบกลับ กรุณาลองใหม่' });
    res.json({ text });
  } catch (e) {
    if (!res.destroyed) res.status(502).json({ error: e.name === 'AbortError' ? 'Gemini ใช้เวลานานเกินไป กรุณาลองใหม่' : 'เชื่อมต่อ Gemini ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต' });
  } finally { clearTimeout(timer); }
});
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.type === 'entity.too.large' ? 'ไฟล์ใหญ่เกินไป กรุณาลดขนาดรูป' : 'ข้อมูลคำขอไม่ถูกต้อง' }));
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '127.0.0.1', () => console.log(`เปิดที่ http://localhost:${port}`));
}
module.exports = app;
