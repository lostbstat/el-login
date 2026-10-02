/* Streamlit Components v1 JSON protocol. No API key enters this file.
   Reference: https://docs.streamlit.io/develop/concepts/custom-components/components-v1/intro */
(() => {
  // Direct Python server: HTTP endpoints. Streamlit iframe: component messages.
  if (window.parent === window || !/\/component\//.test(window.location.pathname)) {
    const ready = fetch('/api/config').then(async response => {
      if (!response.ok) throw new Error('กรุณาเปิดเว็บผ่านเซิร์ฟเวอร์ Python');
      return response.json();
    });
    window.StreamlitBridge = {
      ready,
      async request(payload, signal) {
        const response = await fetch('/api/ai', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), signal
        });
        const result = await response.json();
        if (!response.ok) { const error = new Error(result.error || 'Gemini API error'); error.code = result.code; throw error; }
        return result;
      }
    };
    return;
  }
  let config = null, active = null, counter = 0, readyResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  const queue = [];
  let lastHeight = 0, resizeFrame = null;
  const send = (type, fields) => window.parent.postMessage({ isStreamlitMessage: true, type, ...fields }, '*');
  function resize() {
    if (resizeFrame !== null) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      const height = Math.max(300, Math.ceil(document.body.getBoundingClientRect().height) + 12);
      if (height !== lastHeight) { lastHeight = height; send('streamlit:setFrameHeight', { height }); }
    });
  }
  function cleanup(item) {
    clearTimeout(item.timer);
    item.signal?.removeEventListener('abort', item.abort);
  }
  function dispatch() {
    if (active || !config) return;
    while (queue.length) {
      const item = queue.shift();
      if (item.cancelled) continue;
      active = item;
      item.timer = setTimeout(() => {
        cleanup(item); item.cancelled = true;
        item.reject(new Error('Gemini ใช้เวลานานเกินไป กรุณารีเฟรชหน้าเว็บแล้วลองใหม่'));
        // Keep the request slot until Python acknowledges it, preventing duplicate submissions.
      }, 150000);
      send('streamlit:setComponentValue', { value: { id: item.id, payload: item.payload }, dataType: 'json' });
      return;
    }
  }
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.type !== 'streamlit:render') return;
    const args = event.data.args || {};
    if (args.config) { config = args.config; readyResolve(config); }
    const response = args.response;
    if (active && response?.id === active.id) {
      const item = active; active = null; cleanup(item);
      if (!item.cancelled) {
        if (response.ok) item.resolve({ text: response.text });
        else { const error = new Error(response.error || 'Gemini API error'); error.code = response.code; item.reject(error); }
      }
    }
    dispatch(); resize();
  });
  window.StreamlitBridge = {
    ready,
    request(payload, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        if (queue.length >= 8) return reject(new Error('มีคำขอรออยู่หลายรายการ กรุณารอสักครู่'));
        const item = { id: `${Date.now()}-${++counter}`, payload, signal, resolve, reject, cancelled: false };
        item.abort = () => {
          item.cancelled = true; cleanup(item); reject(new DOMException('Aborted', 'AbortError'));
          // Sent calls may still finish on Python; ignore their response after Stop.
          if (active !== item) dispatch();
        };
        signal?.addEventListener('abort', item.abort, { once: true });
        queue.push(item); dispatch();
      });
    }
  };
  new ResizeObserver(resize).observe(document.body);
  window.addEventListener('load', resize);
  send('streamlit:componentReady', { apiVersion: 1 });
  resize();
})();

// Support the original index.html, including its two elements named chips.
const originalChips = document.querySelectorAll('[id="chips"]');
if (!document.getElementById('chatChips') && originalChips.length > 1) originalChips[1].id = 'chatChips';

const $=id=>document.getElementById(id);
const EN={n1:"📷 AI Assistant",n2:"📊 Dashboard",n3:"🔌 Appliances",set:"Settings",lang:"Language",cur:"Currency",s1:"1) Upload electricity bill photos (any language)",read:"Let AI read the bills",hint:"Hide your name and address before uploading · or enter data manually below",s2:"2) Monthly data (editable)",add:"+ Add row",demo:"Sample data",go:"Open dashboard →",pm:"Month",pa:"Amount",none:"No data yet",del:"Delete",s3:"3) Ask the AI assistant",pq:"Type your question",send:"Send",stop:"Stop",note:"Numbers are computed by code and the AI only explains them · savings are estimates",c1:"Why are some months more expensive?",c2:"Help me plan how to cut my bill",c3:"Which appliances probably use the most power?",k1:"Average / month",k2:"Highest",k3:"Latest vs previous month",k4:"Forecast next month",ksub:"from {0} months",ct:"Actual bills + 3-month forecast",cn:"Linear trend from your own data; seasonality is not modelled (needs 12+ months) · dashed line = your average",need:"Enter at least 3 months on the first page to see charts and forecasts",st2:"🤖 AI summary",sb:"Summarize with AI",at:"Don't know your daily usage? Estimate it from appliances",an:"Enter power (watts, see the label), hours per day and number of units. Defaults are rough averages - adjust them to your home.",aa:"+ Add appliance",pr:"Price per kWh",pn:"Name",u1:"W",u2:"h/day",u3:"units",e0:"Per day",e1:"Per month",e2:"vs your bills (avg {0} kWh)",lo:"Estimate is lower than your bills - some appliances may be missing",hi:"Estimate is higher than your bills - try fewer hours",ok:"Close to your bills",sh:"Share by appliance",cn2:"watts × hours × units × 30 days · estimate only; cycling appliances (fridge, A/C) use less than rated power",it:"🤖 AI insights & saving tips",ib:"Analyze & suggest savings",ts:"saves ~{0} kWh/month{1}",tot:"If you apply all: ~{0} kWh/month{1} (estimate)",apl:"Apply to table",done:"Applied",o1:"Open this app through Python or Streamlit to use Gemini AI",o2:"Image reading is not available here - please enter data manually",r0:"Please choose bill photos first",r1:"Max {0} images at a time",r2:"AI is reading... (may take a moment)",r3:"Read {0} bills - please check the numbers",e_1:"You did not allow AI use",e_2:"Too many requests, try again later",e_3:"Image not usable, try another",e_4:"AI answered in an unreadable format, try a clearer photo",e_5:"Something went wrong, please try again",th:"Thinking...",tr:"Translating the interface...",tf:"Translation failed - showing English",a1:"A/C",a2:"Fridge",a3:"Fan",a4:"TV",a5:"Lights",a6:"Laptop",need2:"Enter at least 3 months first"};
const TH={n1:"📷 ผู้ช่วย AI",n2:"📊 แดชบอร์ด",n3:"🔌 เครื่องใช้ไฟฟ้า",set:"ตั้งค่า",lang:"ภาษา",cur:"สกุลเงิน",s1:"1) อัปโหลดรูปบิลค่าไฟ (ภาษาไหนก็ได้)",read:"ให้ AI อ่านบิล",hint:"ควรปิดชื่อและที่อยู่ก่อนอัปโหลด · หรือกรอกเองด้านล่างก็ได้",s2:"2) ข้อมูลรายเดือน (แก้ไขได้)",add:"+ เพิ่มเอง",demo:"ตัวอย่างข้อมูล",go:"ดูแดชบอร์ด →",pm:"เดือน",pa:"ยอดเงิน",none:"ยังไม่มีข้อมูล",del:"ลบ",s3:"3) ถามผู้ช่วย AI",pq:"พิมพ์คำถามได้เลย",send:"ส่ง",stop:"หยุด",note:"ตัวเลขคำนวณโดยโค้ด AI เป็นผู้เรียบเรียงเท่านั้น · ตัวเลขการประหยัดเป็นค่าประมาณ",c1:"ทำไมบางเดือนบิลแพงกว่าเดือนอื่น",c2:"ช่วยวางแผนลดค่าไฟให้หน่อย",c3:"เครื่องใช้ไฟฟ้าอะไรน่าจะกินไฟมากสุด",k1:"เฉลี่ย/เดือน",k2:"สูงสุด",k3:"เดือนล่าสุดเทียบเดือนก่อน",k4:"พยากรณ์เดือนหน้า",ksub:"จาก {0} เดือน",ct:"ค่าไฟจริง + พยากรณ์ 3 เดือนถัดไป",cn:"แนวโน้มเชิงเส้นจากข้อมูลของคุณเอง ยังไม่จับฤดูกาล (ต้องมี 12 เดือนขึ้นไป) · เส้นประ = ค่าเฉลี่ยของคุณ",need:"กรอกข้อมูลอย่างน้อย 3 เดือนในหน้าแรก จึงจะแสดงกราฟและพยากรณ์ได้",st2:"🤖 AI สรุปภาพรวม",sb:"ให้ AI สรุปให้",at:"ไม่รู้ว่าใช้ไฟวันละเท่าไร? ประมาณจากเครื่องใช้ไฟฟ้า",an:"ใส่กำลังไฟ (วัตต์ ดูจากป้ายเครื่อง) ชั่วโมงที่ใช้ต่อวัน และจำนวนเครื่อง ค่าเริ่มต้นเป็นค่าเฉลี่ยคร่าว ๆ ปรับให้ตรงกับบ้านคุณ",aa:"+ เพิ่มเครื่องใช้",pr:"ราคาต่อ kWh",pn:"ชื่อ",u1:"วัตต์",u2:"ชม./วัน",u3:"เครื่อง",e0:"ต่อวัน",e1:"ต่อเดือน",e2:"เทียบบิลจริง (เฉลี่ย {0} kWh)",lo:"ประมาณการต่ำกว่าบิล อาจมีเครื่องที่ยังไม่ได้ใส่",hi:"ประมาณการสูงกว่าบิล ลองลดชั่วโมงใช้งาน",ok:"ใกล้เคียงบิลจริง",sh:"สัดส่วนแต่ละเครื่อง",cn2:"วัตต์ × ชั่วโมง × จำนวน × 30 วัน · เป็นค่าประมาณ เครื่องที่ทำงานเป็นรอบ (ตู้เย็น แอร์) กินไฟจริงน้อยกว่ากำลังที่ระบุบนป้าย",it:"🤖 AI วิเคราะห์และแนะนำการประหยัดไฟ",ib:"วิเคราะห์และแนะนำวิธีประหยัด",ts:"ประหยัดได้ ~{0} kWh/เดือน{1}",tot:"ถ้าทำครบทุกข้อ: ~{0} kWh/เดือน{1} (ค่าประมาณ)",apl:"ใช้ค่านี้ในตาราง",done:"ใช้แล้ว",o1:"เปิดเว็บผ่าน Python หรือ Streamlit เพื่อใช้งาน Gemini AI",o2:"ที่นี่ยังอ่านรูปไม่ได้ กรุณากรอกข้อมูลเอง",r0:"กรุณาเลือกรูปบิลก่อน",r1:"ส่งได้ครั้งละ {0} รูป",r2:"AI กำลังอ่านบิล... (อาจใช้เวลาสักครู่)",r3:"อ่านได้ {0} บิล กรุณาตรวจสอบตัวเลข",e_1:"คุณไม่ได้อนุญาตให้ใช้ AI",e_2:"ใช้งานถี่เกินไป ลองใหม่ภายหลัง",e_3:"ไฟล์รูปใช้ไม่ได้ ลองรูปอื่น",e_4:"AI ตอบในรูปแบบที่อ่านไม่ได้ ลองรูปที่ชัดขึ้น",e_5:"เกิดข้อผิดพลาด ลองใหม่อีกครั้ง",th:"กำลังคิด...",tr:"กำลังแปลหน้าจอ...",tf:"แปลไม่สำเร็จ แสดงเป็นอังกฤษ",a1:"แอร์",a2:"ตู้เย็น",a3:"พัดลม",a4:"ทีวี",a5:"หลอดไฟ",a6:"โน้ตบุ๊ก",need2:"กรอกอย่างน้อย 3 เดือนก่อน"};
Object.assign(EN,{pt:"Usage pattern & forecast model",peak:"Highest month",low:"Lowest month",spr:"High vs low gap",upk:"Avg cost per kWh",md:"Forecast model",mch:"Month-by-month change",m_lin:"Linear regression",m_holt:"Exponential smoothing",m_ma:"Moving average (3 months)",bt:"Monthly budget check",bh:"Set a budget to see if the next 3 months go over",bp:"e.g. 2000",bok:"Within budget",bov:"Over by {0}",cn:"Model chosen automatically by back-testing on your own data (linear, exponential smoothing or moving average); needs 12+ months to capture seasons · dashed line = your average"});
Object.assign(TH,{pt:"รูปแบบการใช้ไฟ และโมเดลพยากรณ์",peak:"เดือนที่ใช้สูงสุด",low:"เดือนที่ใช้ต่ำสุด",spr:"ส่วนต่างสูง-ต่ำ",upk:"ค่าไฟเฉลี่ยต่อหน่วย",md:"โมเดลพยากรณ์",mch:"การเปลี่ยนแปลงรายเดือน",m_lin:"ถดถอยเชิงเส้น",m_holt:"Exponential smoothing",m_ma:"ค่าเฉลี่ยเคลื่อนที่ 3 เดือน",bt:"เช็กงบค่าไฟรายเดือน",bh:"ตั้งงบไว้ ดูว่า 3 เดือนข้างหน้าเกินไหม",bp:"เช่น 2000",bok:"อยู่ในงบ",bov:"เกินงบ {0}",cn:"ระบบเลือกโมเดลที่แม่นที่สุดให้อัตโนมัติ โดยทดสอบย้อนหลังกับข้อมูลของคุณ (เส้นตรง / exponential smoothing / ค่าเฉลี่ยเคลื่อนที่) ยังไม่จับฤดูกาล (ต้องมี 12 เดือนขึ้นไป) · เส้นประ = ค่าเฉลี่ยของคุณ"});
Object.assign(EN,{tk:"Theme color",tp:"Pick any color, or tap a preset. The whole page adapts to it.",ta:"Auto",tl:"Light",td:"Dark",tkr:"Reset"});
Object.assign(TH,{tk:"สีธีมของเว็บ",tp:"เลือกสีอะไรก็ได้ หรือกดสีสำเร็จรูป ทั้งหน้าจะเปลี่ยนตามสีที่เลือก",ta:"อัตโนมัติ",tl:"สว่าง",td:"มืด",tkr:"รีเซ็ต"});
Object.assign(EN,{n4:"💰 Budget planner",pl_t:"Plan by budget (dorm mode)",pl_n:"Tell us the most you can pay per month. The app works out how many hours per day you can use each appliance. It is a calculation, not a trained model.",pl_b:"Max per month",pl_f:"Fixed fees (rent-included meter fee, etc.)",pl_l:"Max total watts at once",pl_lh:"Plug/breaker limit: a 10A outlet is about 2200 W. Dorms are often lower, so check your rules.",pl_an:"Priority: Must = never cut · Important = can be cut to 40% · Nice = cut first. Duty % = share of time the compressor really runs (A/C ~70, fridge ~40).",pl_p1:"Must",pl_p2:"Important",pl_p3:"Nice-to-have",pl_d:"% duty",pl_x:"Fixed fees are already more than your budget.",pl_k1:"Allowed usage",pl_k2:"Planned usage",pl_k3:"Planned cost",pl_k4:"Left over",pl_ok:"Your wish list already fits the budget",pl_cut:"Hours were reduced to fit the budget",pl_no:"Even the minimum plan is {0} kWh over. Raise the budget by about {1} or cut a Must item.",pl_w:"Running everything at once needs {0} W, above your {1} W limit. Do not run these together: {2}",pl_from:"want {0} → plan",pl_hd:"Recommended hours per day",pl_ai:"Explain my plan with AI",pl_ac:"A/C tip: set 26-27°C + fan, use a timer"});
Object.assign(TH,{n4:"💰 วางแผนตามงบ",pl_t:"วางแผนตามงบ (โหมดหอพัก)",pl_n:"บอกงบสูงสุดต่อเดือน แล้วระบบจะคำนวณว่าแต่ละเครื่องใช้ได้วันละกี่ชั่วโมง เป็นการคำนวณ ไม่ใช่โมเดลที่ต้องเทรน",pl_b:"งบสูงสุด/เดือน",pl_f:"ค่าคงที่ (ค่าบริการมิเตอร์ ฯลฯ)",pl_l:"วัตต์รวมสูงสุดพร้อมกัน",pl_lh:"เพดานปลั๊ก/เบรกเกอร์: ปลั๊ก 10A ประมาณ 2200 วัตต์ หอพักมักต่ำกว่านี้ ลองเช็กกฎของหอ",pl_an:"ความสำคัญ: จำเป็น = ไม่ตัด · สำคัญ = ลดได้ถึง 40% · ไม่จำเป็น = ตัดก่อน / % ทำงานจริง = สัดส่วนที่คอมเพรสเซอร์ทำงานจริง (แอร์ ~70 ตู้เย็น ~40)",pl_p1:"จำเป็น",pl_p2:"สำคัญ",pl_p3:"ไม่จำเป็น",pl_d:"% ทำงานจริง",pl_x:"ค่าคงที่มากกว่างบที่ตั้งไว้แล้ว",pl_k1:"ใช้ได้ไม่เกิน",pl_k2:"แผนที่แนะนำ",pl_k3:"ค่าไฟตามแผน",pl_k4:"เหลืองบ",pl_ok:"ที่ตั้งไว้อยู่ในงบอยู่แล้ว",pl_cut:"ลดชั่วโมงลงเพื่อให้พอดีงบ",pl_no:"แม้ใช้ขั้นต่ำสุดก็ยังเกิน {0} kWh ควรเพิ่มงบราว {1} หรือลดเครื่องที่ตั้งเป็นจำเป็น",pl_w:"เปิดพร้อมกันหมดจะใช้ {0} วัตต์ เกินเพดาน {1} วัตต์ อย่าเปิดพร้อมกัน: {2}",pl_from:"อยากใช้ {0} → แผน",pl_hd:"ชั่วโมงที่แนะนำต่อวัน",pl_ai:"ให้ AI อธิบายแผนให้",pl_ac:"เคล็ดลับแอร์: ตั้ง 26-27°C + เปิดพัดลมช่วย และตั้งเวลาปิด"});
Object.assign(EN,{rm_t:"My room",rm_h:"Pick an appliance below to put it in the room · drag to move (AC, TV, lamp, fan can go on the wall) · tap to select, edit or rotate",rm_e:"The room is empty - pick appliances below",rm_s:"Sample room",rm_c:"Clear room",rm_r:"Remove",rm_rot:"Rotate",rm_lk0:"Lock",n5:"⚙️ Settings",pt_a:"Appliances",pt_f:"Furniture",rm_w:"Width",rm_dp:"Depth",rm_e2:"Edit",ch_m:"kWh / month",ch_c:"est. cost",ch_over:"over budget",ch_ok:"within budget",ch_nobud:"set budget in Settings",rm_h:"Tap an item below to place it · drag to move · drag AC / TV / lamp / fan onto a wall",rm_lk1:"Locked",f_table:"Table",f_desk:"Desk",f_tvc:"TV cabinet",f_bed:"Bed",f_sofa:"Sofa",rm_d:"Window & shelf",rm_o:"Other",hm_at:"Appliance details"});
Object.assign(TH,{rm_t:"ห้องของฉัน",rm_h:"เลือกเครื่องใช้ด้านล่างเพื่อวางลงห้อง · ลากเพื่อย้าย (แอร์ ทีวี โคมไฟ พัดลม ติดผนังได้) · แตะเพื่อเลือก แก้ หรือหมุน",rm_e:"ห้องยังว่างอยู่ เลือกเครื่องใช้ด้านล่างได้เลย",rm_s:"ตัวอย่างห้อง",rm_c:"ล้างห้อง",rm_r:"เอาออก",rm_rot:"หมุน",rm_lk0:"ล็อค",n5:"⚙️ ตั้งค่า",pt_a:"เครื่องใช้ไฟฟ้า",pt_f:"เฟอร์นิเจอร์",rm_w:"กว้าง",rm_dp:"ลึก",rm_e2:"แก้ไข",ch_m:"kWh ต่อเดือน",ch_c:"ค่าไฟประมาณ",ch_over:"เกินงบ",ch_ok:"อยู่ในงบ",ch_nobud:"ตั้งงบที่หน้าตั้งค่า",rm_h:"แตะของด้านล่างเพื่อวางลงห้อง · ลากเพื่อย้าย · ลากแอร์/ทีวี/โคมไฟ/พัดลมขึ้นผนังได้",rm_lk1:"ล็อคอยู่",f_table:"โต๊ะ",f_desk:"โต๊ะทำงาน",f_tvc:"ตู้ทีวี",f_bed:"เตียง",f_sofa:"โซฟา",rm_d:"หน้าต่าง/ชั้นวาง",rm_o:"อื่น ๆ",hm_at:"รายละเอียดเครื่องใช้"});
Object.assign(EN,{n0:"🏠 Home",n3:"🔌 Usage breakdown",hm_t:"Your home at a glance",hm_n:"Set up once here - every page uses the same appliances, price and budget, so the numbers always match. Tap a card to jump to that page.",hm_s:"Price & budget",hm_at:"My appliances",ed_n:"Appliances, price and budget come from the Home page",ed_b:"Edit on Home",bh0:"Set a monthly budget on the Home page to see if the next 3 months go over",noapp:"No appliances yet - add them on the Home page",hs1:"{0} months · avg {1}",hs2:"Charts, forecast & budget check",hs3:"≈ {0} kWh/month · ≈ {1}",hs4:"Allowed {0} kWh · plan {1} kWh",pl_ah2:"Set a monthly budget and appliances on the Home page first",hp:"Your bills average {0} per kWh",hpb:"Use this price",cn2:"watts × hours × units × duty % × 30 days · estimate only"});
Object.assign(TH,{n0:"🏠 หน้าหลัก",n3:"🔌 สัดส่วนการใช้ไฟ",hm_t:"ภาพรวมบ้านของคุณ",hm_n:"ตั้งค่าครั้งเดียวที่หน้านี้ ทุกหน้าใช้เครื่องใช้ ราคา และงบชุดเดียวกัน ตัวเลขจึงตรงกันหมด · กดการ์ดเพื่อไปหน้านั้น",hm_s:"ราคาไฟและงบ",hm_at:"เครื่องใช้ไฟฟ้าของฉัน",ed_n:"เครื่องใช้ ราคา และงบ มาจากหน้าหลัก",ed_b:"แก้ที่หน้าหลัก",bh0:"ตั้งงบที่หน้าหลัก แล้วจะดูได้ว่า 3 เดือนข้างหน้าเกินไหม",noapp:"ยังไม่มีเครื่องใช้ไฟฟ้า เพิ่มได้ที่หน้าหลัก",hs1:"{0} เดือน · เฉลี่ย {1}",hs2:"กราฟ พยากรณ์ และเช็กงบ",hs3:"≈ {0} kWh/เดือน · ≈ {1}",hs4:"ใช้ได้ {0} kWh · แผน {1} kWh",pl_ah2:"ตั้งงบต่อเดือนและใส่เครื่องใช้ที่หน้าหลักก่อน",hp:"บิลจริงของคุณเฉลี่ย {0} ต่อ kWh",hpb:"ใช้ค่านี้",cn2:"วัตต์ × ชั่วโมง × จำนวน × % ทำงานจริง × 30 วัน · เป็นค่าประมาณ"});
Object.assign(EN,{f_chair:"Chair",f_ward:"Wardrobe",f_shelf:"Bookshelf",f_night:"Nightstand",f_ctab:"Coffee table",md0:"Model: default",mdn:"Pick a popular model to set a typical wattage and change how the appliance looks in the room. Wattages are typical values - check your own label."});
Object.assign(TH,{f_chair:"เก้าอี้",f_ward:"ตู้เสื้อผ้า",f_shelf:"ชั้นวางหนังสือ",f_night:"โต๊ะข้างเตียง",f_ctab:"โต๊ะกลาง",md0:"รุ่น: ค่าเริ่มต้น",mdn:"เลือกรุ่นยอดนิยมเพื่อใส่วัตต์โดยประมาณ และเปลี่ยนหน้าตาเครื่องในห้อง ค่าวัตต์เป็นค่าทั่วไป ควรเช็กจากป้ายเครื่องจริงอีกครั้ง"});
Object.assign(EN,{n6:"👥 Friends",so_t:"Friends & privacy",so_n:"Friends here are demo (mock) data. Choose what others can see about you.",so_v:"Who can visit my room",so_va:"Everyone",so_vf:"Friends only",so_vn:"Nobody (closed)",so_pp:"People in my room",so_rk:"Show me in the ranking",so_det:"Share my appliance details (needed for the AI comparison and room visits)",so_rt:"Ranking",so_m1:"Most saved vs bill average",so_m2:"Lowest kWh per person",so_m3:"Lowest kWh / month",so_hid:"hidden",so_vt:"Visit a friend's room",so_go:"Visit",so_cl:"Room closed",so_back:"Close",so_nd:"This friend does not share appliance details",so_ct:"🤖 Learn from a similar friend",so_cn:"Similarity = how alike the appliance types of two rooms are (cosine similarity). Only friends who share details are compared. Numbers are computed by code; AI only explains.",so_none:"No similar friend uses less power than you. Nice!",so_ai:"Ask AI why & what to buy",md_u:"model not set",so_you:"You",so_ph:"Add appliances to your room first",so_sim:"similar",so_rc:"Turn on 'share my appliance details' to compare with friends",so_fr:"Friend",so_mo:"See all & visit friends",dc_t:"🎨 Decorate",dc_p:"Presets",dc_w:"Walls",dc_f:"Floor",dc_g:"Grid",dc_wd:"Wood",dc_tl:"Tiles",dc_pl:"Plain walls",dc_st:"Striped walls"});
Object.assign(TH,{n6:"👥 เพื่อน",so_t:"เพื่อนและความเป็นส่วนตัว",so_n:"เพื่อนในหน้านี้เป็นข้อมูลจำลอง (mock) เลือกได้ว่าอยากให้คนอื่นเห็นอะไรของเรา",so_v:"ใครเข้าเยี่ยมห้องได้",so_va:"ทุกคน",so_vf:"เฉพาะเพื่อน",so_vn:"ไม่มีใคร (ปิดห้อง)",so_pp:"คนในห้อง",so_rk:"แสดงฉันในอันดับ",so_det:"แชร์รายละเอียดเครื่องใช้ (ต้องเปิดถึงจะเทียบกับเพื่อนด้วย AI ได้)",so_rt:"อันดับ",so_m1:"ประหยัดขึ้นมากสุด (เทียบค่าเฉลี่ยบิล)",so_m2:"kWh ต่อคนน้อยสุด",so_m3:"kWh/เดือนน้อยสุด",so_hid:"ซ่อนข้อมูล",so_vt:"ไปเยี่ยมห้องเพื่อน",so_go:"เยี่ยมห้อง",so_cl:"ปิดห้อง",so_back:"ปิด",so_nd:"เพื่อนคนนี้ไม่แชร์รายละเอียดเครื่องใช้",so_ct:"🤖 เรียนรู้จากเพื่อนที่ห้องคล้ายกัน",so_cn:"ความคล้าย = เครื่องใช้ในสองห้องเป็นประเภทเดียวกันแค่ไหน (cosine similarity) เทียบเฉพาะเพื่อนที่แชร์รายละเอียด ตัวเลขคำนวณด้วยโค้ด AI เป็นผู้อธิบายเท่านั้น",so_none:"ไม่มีเพื่อนที่ห้องคล้ายกันและใช้ไฟน้อยกว่าคุณ เยี่ยมมาก!",so_ai:"ให้ AI วิเคราะห์สาเหตุและแนะนำรุ่น",md_u:"ไม่ระบุรุ่น",so_you:"ฉัน",so_ph:"ใส่เครื่องใช้ในห้องของคุณก่อน",so_sim:"คล้าย",so_rc:"เปิด 'แชร์รายละเอียดเครื่องใช้' ก่อน ถึงจะเทียบกับเพื่อนได้",so_fr:"เพื่อน",so_mo:"ดูทั้งหมดและเยี่ยมห้องเพื่อน",dc_t:"🎨 ตกแต่งห้อง",dc_p:"ชุดสี",dc_w:"ผนัง",dc_f:"พื้น",dc_g:"พื้นตาราง",dc_wd:"พื้นไม้",dc_tl:"พื้นกระเบื้อง",dc_pl:"ผนังเรียบ",dc_st:"ผนังลายทาง"});
Object.assign(EN,{ht_d:"🏢 Dorm / room",ht_h:"🏠 House",fl_1:"Floor 1",fl_2:"Floor 2",x_wh:"Water heater",pl_t:"Plan by budget",pl_lh:"Plug/breaker limit: a 10A outlet is about 2200 W. If you live in a dorm, check the building rules too.",
oc_t:"🛡️ Overcharge check",oc_n:"Compare what you were billed with the utility (MEA/PEA) residential tariff. Useful for dorm/rental meters and for your own bill. Rates are reference values - Ft changes every 4 months, so copy it from your bill.",oc_u:"Units billed",oc_a:"Amount charged",oc_l:"Use latest bill",oc_mp:"Meter before",oc_mc:"Meter after",oc_ft:"Ft (per unit)",
oc_f:"By the utility tariff, {0} units ≈ {1} {3} (avg {2} {3}/unit, incl. service fee and 7% VAT)",oc_hi:"⚠️ You were charged {0} {3}, about {1} {3} above the utility tariff ({2} {3}/unit vs official). Ask how it was calculated.",oc_ok:"✅ The amount is in line with the utility tariff",
oc_mh:"⚠️ Billed {0} units but the meter moved only {1} units - {2} units too many",oc_mo:"✅ Billed units match the meter",oc_eh:"ℹ️ Billed units are well above what your appliances explain (~{0} units). Some appliance may be missing - or compare with the meter.",oc_sh:"ℹ️ More than 40% above your usual bills (avg {0} units)",
oc_w:"Landlords may only pass on the utility's rate - ask to see the bill or the sub-meter. Hotlines: MEA 1130 · PEA 1129 · ERC 1204. This is a guide, not a legal ruling."});
Object.assign(TH,{ht_d:"🏢 หอพัก / ห้องเช่า",ht_h:"🏠 บ้าน",fl_1:"ชั้น 1",fl_2:"ชั้น 2",x_wh:"เครื่องทำน้ำอุ่น",pl_t:"วางแผนตามงบ",pl_lh:"เพดานปลั๊ก/เบรกเกอร์: ปลั๊ก 10A ประมาณ 2200 วัตต์ ถ้าอยู่หอ ลองเช็กกฎของหอด้วย",
oc_t:"🛡️ เช็กโดนเก็บค่าไฟเกินไหม",oc_n:"เทียบยอดที่ถูกเรียกเก็บกับอัตราค่าไฟบ้านอยู่อาศัยของการไฟฟ้า (กฟน./กฟภ.) ใช้ได้ทั้งหอ/ห้องเช่าและบิลบ้านตัวเอง อัตราเป็นค่าอ้างอิง ค่า Ft เปลี่ยนทุก 4 เดือน ควรกรอกตามบิลจริง",oc_u:"หน่วยที่เรียกเก็บ",oc_a:"ยอดที่เก็บ",oc_l:"ใช้บิลล่าสุด",oc_mp:"เลขมิเตอร์ก่อน",oc_mc:"เลขมิเตอร์หลัง",oc_ft:"ค่า Ft (บาท/หน่วย)",
oc_f:"ตามอัตราการไฟฟ้า {0} หน่วย ≈ {1} {3} (เฉลี่ย {2} {3}/หน่วย รวมค่าบริการและ VAT 7%)",oc_hi:"⚠️ ถูกเก็บ {0} {3} สูงกว่าอัตราการไฟฟ้าราว {1} {3} (เฉลี่ย {2} {3}/หน่วยตามอัตราจริง) ควรถามวิธีคิด",oc_ok:"✅ ยอดอยู่ในเกณฑ์ตามอัตราการไฟฟ้า",
oc_mh:"⚠️ เรียกเก็บ {0} หน่วย แต่มิเตอร์วิ่งจริง {1} หน่วย เกินมา {2} หน่วย",oc_mo:"✅ หน่วยที่เก็บตรงกับมิเตอร์",oc_eh:"ℹ️ หน่วยที่เก็บสูงกว่าที่เครื่องใช้ของคุณอธิบายได้มาก (~{0} หน่วย) อาจมีเครื่องที่ยังไม่ได้ใส่ หรือลองเทียบกับมิเตอร์",oc_sh:"ℹ️ สูงกว่าบิลปกติของคุณเกิน 40% (เฉลี่ย {0} หน่วย)",
oc_w:"ผู้ให้เช่าเรียกเก็บได้ตามอัตราที่การไฟฟ้าคิดเท่านั้น ขอดูบิลหรือมิเตอร์ย่อยได้ · สายด่วน กฟน. 1130 · กฟภ. 1129 · กกพ. 1204 · เป็นข้อมูลประกอบ ไม่ใช่คำตัดสินทางกฎหมาย"});
Object.assign(EN,{bc_t:"🧮 Bill calculator (both ways)",bc_n:"Standard residential meter (MEA/PEA tiered rates + Ft + 7% VAT). Type units to get the amount, or an amount to get the units. Approximate.",bc_ft:"Ft (per unit)",bc_u:"Units →",bc_a:"Amount →",bc_r1:"≈ {1} {2} for {0} units",bc_r2:"≈ {0} units for {1} {2}",
tou_t:"⏰ TOU meter vs normal meter",tou_n:"TOU charges by time of day: expensive on weekdays 09:00-22:00 (On-Peak), cheap at night, weekends and holidays (Off-Peak). Worth it only if you use a lot of power off-peak. Houses only - dorm tenants cannot change the landlord's meter.",tou_u:"Units/month",tou_l:"Use bill average",tou_p:"Off-Peak %",tou_f:"Meter change fee",
tou_r:"Normal meter ≈ {0} {2} · TOU meter ≈ {1} {2} per month",tou_s:"✅ TOU would save about {0} {1} per month",tou_w:"⚠️ TOU would cost about {0} {1} MORE per month - stay with the normal meter",tou_be:"Break-even: TOU wins if more than {0}% of your usage is Off-Peak",tou_bn:"TOU does not win at any share with these numbers",tou_pb:"The meter fee pays back in about {0} months",
tou_h:"Reference rates: On-Peak 5.7982, Off-Peak 2.6369, service 38.22 (under 22 kV). Fee ~3,300 for a 1-phase PEA meter (2026) - confirm with your utility. Off-Peak share is your estimate: if nobody is home on weekdays it can be 60-70%."});
Object.assign(TH,{bc_t:"🧮 เครื่องคิดเลขค่าไฟ (คำนวณได้ 2 ทาง)",bc_n:"มิเตอร์ปกติบ้านอยู่อาศัย (อัตราขั้นบันได กฟน./กฟภ. + Ft + VAT 7%) ใส่หน่วยได้ยอดเงิน หรือใส่ยอดเงินได้จำนวนหน่วย เป็นค่าประมาณ",bc_ft:"ค่า Ft (บาท/หน่วย)",bc_u:"ใส่หน่วย →",bc_a:"ใส่ยอดเงิน →",bc_r1:"≈ {1} {2} สำหรับ {0} หน่วย",bc_r2:"≈ {0} หน่วย สำหรับ {1} {2}",
tou_t:"⏰ เทียบมิเตอร์ TOU กับมิเตอร์ปกติ",tou_n:"TOU คิดค่าไฟตามช่วงเวลา จันทร์-ศุกร์ 09:00-22:00 แพง (On-Peak) กลางคืน เสาร์-อาทิตย์ และวันหยุด ถูก (Off-Peak) คุ้มเมื่อใช้ไฟช่วงถูกเยอะ ใช้ได้เฉพาะบ้าน คนอยู่หอเปลี่ยนมิเตอร์ของเจ้าของไม่ได้",tou_u:"หน่วย/เดือน",tou_l:"ใช้ค่าเฉลี่ยจากบิล",tou_p:"ใช้ช่วงถูก %",tou_f:"ค่าเปลี่ยนมิเตอร์",
tou_r:"มิเตอร์ปกติ ≈ {0} {2} · มิเตอร์ TOU ≈ {1} {2} ต่อเดือน",tou_s:"✅ เปลี่ยนเป็น TOU ประหยัดประมาณ {0} {1} ต่อเดือน",tou_w:"⚠️ เปลี่ยนเป็น TOU จะจ่ายเพิ่มประมาณ {0} {1} ต่อเดือน อยู่มิเตอร์ปกติดีกว่า",tou_be:"จุดคุ้มทุน: TOU จะดีกว่าเมื่อใช้ไฟช่วงถูกเกิน {0}% ของทั้งหมด",tou_bn:"ด้วยตัวเลขนี้ TOU ไม่คุ้มไม่ว่าสัดส่วนเท่าไร",tou_pb:"ค่าเปลี่ยนมิเตอร์คืนทุนในราว {0} เดือน",
tou_h:"อัตราอ้างอิง: On-Peak 5.7982, Off-Peak 2.6369, ค่าบริการ 38.22 (ต่ำกว่า 22 kV) ค่าเปลี่ยนมิเตอร์ 1 เฟสของ กฟภ. ราว 3,300 บาท (ปี 2569) ควรถามการไฟฟ้าอีกที สัดส่วนช่วงถูกเป็นค่าที่คุณประมาณเอง ถ้าวันธรรมดาไม่มีคนอยู่บ้านอาจสูงถึง 60-70%"});
const LANGS=[["th","ไทย",TH],["en","English",EN],["zh","中文"],["ja","日本語"],["ko","한국어"],["id","Bahasa Indonesia"],["vi","Tiếng Việt"],["es","Español"],["fr","Français"],["de","Deutsch"],["pt","Português"],["ar","العربية"],["hi","हिन्दी"]];
const LN=()=>LANGS.find(l=>l[0]==lc)[1];let lc='th';const cache={th:TH,en:EN};let L=TH;
const t=(k,...a)=>String(L[k]??EN[k]??k).replace(/\{(\d)\}/g,(_,i)=>a[i]);
LANGS.forEach(l=>$('lang').add(new Option(l[1],l[0])));$('lang').value='th';
let bills=[],sample=null,caps=null,turns=[],ctl=null,D={},E=null,cnt=0;
const SAMP=[["a1",900,8,1,2,70],["a2",55,24,1,1,40],["a3",50,8,2,2,100],["a4",100,4,1,3,100],["a5",10,6,6,2,100],["a6",60,6,1,1,100]].map(a=>({k:a[0],n:'',w:a[1],h:a[2],q:a[3],p:a[4],d:a[5]}));let apps=[],SEL=null;
const nm=a=>a.k?t(a.k):a.n,cur=()=>$('cur').value||'';
const ERR=e=>e.name==='AbortError'? (lc==='th'?'หยุดแล้ว':'Stopped') : e.text||e.message||t({not_granted:'e_1',rate_limited:'e_2',image_rejected:'e_3',invalid_json:'e_4'}[e.code]||'e_5');
function ui(){document.documentElement.lang=lc;document.documentElement.dir=lc=='ar'?'rtl':'ltr';document.querySelectorAll('[data-i]').forEach(e=>e.textContent=t(e.dataset.i));document.querySelectorAll('[data-p]').forEach(e=>e.placeholder=t(e.dataset.p));
['n0','n1','n2','n3','n4','n5','n6'].forEach(k=>$(k).textContent=t(k));$('chatChips').innerHTML=['c1','c2','c3'].map(k=>`<button class="g" onclick="$('q').value=this.textContent;ask()">${t(k)}</button>`).join('');rows();ap();if(!$('p2').hidden)dash();if(!$('p3').hidden)est();if(!$('p4').hidden)plan();if(!$('p6').hidden)soc()}
$('lang').onchange=async()=>{const c=$('lang').value;if(!cache[c]){if(!sample){$('tst').textContent=t('o1');$('lang').value=lc;return}$('tst').textContent=t('tr');$('lang').disabled=true;
try{const r=await sample.json(`Translate the values of this JSON object into ${LANGS.find(l=>l[0]==c)[1]}. Keep every key unchanged, keep emoji, arrows, symbols and {0}/{1} placeholders exactly. Return only the JSON object.\n\n`+JSON.stringify(EN),{modelTier:"quick",cache:{gcTime:864e5}});cache[c]=r&&typeof r=='object'?r:EN;$('tst').textContent=''}catch(e){cache[c]=EN;$('tst').textContent=t('tf')}$('lang').disabled=false}
lc=c;L=cache[c];ui()};
function go(n){[0,1,2,3,4,5,6].forEach(i=>{$('p'+i).hidden=i!=n;$('n'+i).className=i==n?'on':''});scrollTo(0,0);if(n==2)dash();if(n==0)pl();if(n==3)est();if(n==4)plan();if(n==6)soc()}
// Browser adapter: all Gemini calls go through our own server.
function imageData(file, signal) {
  if (!caps.images.mimeTypes.includes(file.type) || file.size > caps.images.maxBytes) throw new Error('รูปต้องเป็น PNG, JPEG, WebP, HEIC หรือ HEIF และขนาดไม่เกิน 3 MB');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    reader.onload = () => { cleanup(); resolve({ mimeType: file.type, data: String(reader.result).split(',')[1] }); };
    reader.onerror = () => { cleanup(); reject(new Error('อ่านไฟล์รูปไม่สำเร็จ')); };
    reader.onabort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    reader.readAsDataURL(file);
  });
}
async function geminiRequest(input, options = {}, json = false) {
  const images = await Promise.all((options.images || []).map(file => imageData(file, options.signal)));
  if (images.length > caps.images.maxCount) throw new Error(t('r1', caps.images.maxCount));
  const body = { images, json, ...(Array.isArray(input) ? { messages: input } : { prompt: input }) };
  const result = await window.StreamlitBridge.request(body, options.signal);
  if (typeof result.text !== 'string') throw new Error('ไม่มีข้อความตอบกลับจาก Gemini');
  options.onText?.({ text: result.text });
  if (!json) return { text: result.text };
  try { return JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { const error = new Error(t('e_4')); error.code = 'invalid_json'; throw error; }
}
sample = (input, options) => geminiRequest(input, options);
sample.json = (input, options) => geminiRequest(input, options, true);
caps = { images: { maxCount: 4, maxBytes: 3 * 1024 * 1024, mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'] } };
(async () => {
  try {
    const config = await window.StreamlitBridge.ready;
    caps.images = config.images;
    if (!config.configured) $('st').textContent = config.runtime === 'python' ? 'กรุณาใส่ GEMINI_API_KEY ในไฟล์ .env แล้วรัน Python ใหม่' : 'กรุณาตั้งค่า GEMINI_API_KEY ใน Secrets ของ Streamlit';
  } catch (e) { $('st').textContent = e.message; }
})();
function rows(){$('rows').innerHTML=bills.map((b,i)=>`<div class="row"><input class="n" value="${b.m||''}" placeholder="${t('pm')}" oninput="bills[${i}].m=this.value"><input type="number" value="${b.amt??''}" placeholder="${t('pa')}" oninput="bills[${i}].amt=this.value===''?null:+this.value"><input type="number" value="${b.kwh??''}" placeholder="kWh" oninput="bills[${i}].kwh=this.value===''?null:+this.value"><button class="g" onclick="bills.splice(${i},1);rows()">${t('del')}</button></div>`).join('')||`<div class="note">${t('none')}</div>`}
function addRow(){bills.push({m:'',amt:null,kwh:null});rows()}
function demo(){const mo=i=>new Date(2026,i,1).toLocaleString(lc,{month:'short'});bills=[[1180,290],[1260,310],[1610,400],[1940,480],[2050,505],[1980,490]].map((a,i)=>({m:mo(i),amt:a[0],kwh:a[1]}));rows()}
function stats(){const v=bills.filter(b=>b.amt!=null);if(!v.length)return null;const avg=v.reduce((s,b)=>s+b.amt,0)/v.length,mx=v.reduce((p,c)=>c.amt>p.amt?c:p),mn=v.reduce((p,c)=>c.amt<p.amt?c:p),k=v.filter(b=>b.kwh),up=k.length?k.reduce((s,b)=>s+b.amt,0)/k.reduce((s,b)=>s+b.kwh,0):null,ak=k.length?k.reduce((s,b)=>s+b.kwh,0)/k.length:null;return{n:v.length,avg:Math.round(avg),mx,mn,up,ak}}
async function readBills(){const fs=[...$('f').files];if(!fs.length){$('st').textContent=t('r0');return}if(fs.length>caps.images.maxCount){$('st').textContent=t('r1',caps.images.maxCount);return}
$('rd').disabled=true;$('st').textContent=t('r2');
try{const r=await sample.json(`The attached images are ${fs.length} electricity bills (any language or country). Read each one. Reply with only a JSON array, one object per bill: {"m":"billing month/year, short","amt":total amount due as a number,"kwh":kWh used as a number,"cur":"currency symbol"}. Use null for anything you cannot read. Never guess numbers.`,{images:fs});
const l=(Array.isArray(r)?r:[r]).filter(x=>x&&typeof x==='object');if(l[0]&&l[0].cur)$('cur').value=l[0].cur;
bills.push(...l.map(x=>({m:String(x.m??''),amt:x.amt!=null&&isFinite(+x.amt)?+x.amt:null,kwh:x.kwh!=null&&isFinite(+x.kwh)?+x.kwh:null})));rows();$('st').textContent=t('r3',l.length)}
catch(e){$('st').textContent=ERR(e)}$('rd').disabled=false}
function ctx(){const s=stats();let x=s?`User's bills (currency ${cur()}; numbers already computed by the system, do not recompute):\n${bills.filter(b=>b.amt!=null).map(b=>`- ${b.m}: ${b.amt}${b.kwh?`, ${b.kwh} kWh`:''}`).join('\n')}\nAverage ${s.avg}/month | highest ${s.mx.m} ${s.mx.amt} | lowest ${s.mn.m} ${s.mn.amt}${s.up?` | avg ${s.up.toFixed(2)} per kWh`:''}`:'The user has no bill data yet.';
if(E)x+=`\nAppliance estimate (rough): ${E.list.map(a=>`${a.n||'?'} ${a.kwh.toFixed(0)} kWh/month`).join(', ')}; total ${E.tot.toFixed(0)} kWh/month`;const pb=+$('pb').value;if(pb)x+=`\nMonthly budget ${pb} ${cur()}; price per kWh ${$('price').value||'unknown'}.`;return x}
const RULES=()=>`You are a friendly electricity-saving assistant for ordinary households in any country. Reply in ${LN()}. Be concise (max 6 lines). Use only the numbers provided. You do not know the user's country tariffs, so never cite national rates or averages. If data is insufficient, say so; do not guess. Savings are estimates; causes are possibilities, not conclusions.`;
function add(c,x){const d=document.createElement('div');d.className='m '+c;d.textContent=x;$('log').append(d);$('log').scrollTop=1e9;return d}
async function ask(){const x=$('q').value.trim();if(!x||!sample)return;$('q').value='';add('u',x);const b=add('a',t('th'));turns.push({role:'user',content:x});$('sd').disabled=true;$('sp').hidden=false;ctl=new AbortController();
try{const r=await sample([{role:'user',content:RULES()+'\n\n'+ctx()+'\n\nConversation follows.'},...turns.slice(-8)],{cache:false,signal:ctl.signal,modelTier:"quick",onText:({text})=>{b.textContent=text;$('log').scrollTop=1e9}});turns.push({role:'assistant',content:r.text})}
catch(e){b.textContent=ERR(e);if(!e.text)turns.pop()}$('sd').disabled=false;$('sp').hidden=true}
$('q').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask()}});
function lin(x,y){const n=x.length,mx=x.reduce((a,b)=>a+b)/n,my=y.reduce((a,b)=>a+b)/n;let sxy=0,sxx=0;x.forEach((v,i)=>{sxy+=(v-mx)*(y[i]-my);sxx+=(v-mx)**2});const b=sxx?sxy/sxx:0,a=my-b*mx;return{a,b,s:n>2?Math.sqrt(y.reduce((q,v,i)=>q+(v-a-b*x[i])**2,0)/(n-2)):0}}
const MD={m_lin:(y,h)=>{const f=lin(y.map((_,i)=>i),y);return Array.from({length:h},(_,k)=>f.a+f.b*(y.length+k))},
m_holt:(y,h)=>{let l=y[0],b=y[1]-y[0];for(let i=1;i<y.length;i++){const q=l;l=.6*y[i]+.4*(l+b);b=.3*(l-q)+.7*b}return Array.from({length:h},(_,k)=>l+b*(k+1))},
m_ma:(y,h)=>{const r=y.slice(-3),m=r.reduce((a,b)=>a+b)/r.length;return Array(h).fill(m)}};
function bestModel(y){let B=null;const n=y.length;for(const k in MD){let e=0,c=0;for(let i=Math.max(3,n-3);i<n;i++){e+=Math.abs(MD[k](y.slice(0,i),1)[0]-y[i]);c++}const mae=c?e/c:lin(y.map((_,i)=>i),y).s;if(!B||mae<B.mae)B={k,mae}}return{k:B.k,name:t(B.k),mae:B.mae,fc:MD[B.k](y,3).map(v=>Math.max(0,Math.round(v)))}}
function pattern(vi,s,M){const c=cur(),mx=s.mx.amt,ch=[[t('peak'),s.mx.m+' · '+s.mx.amt+' '+c],[t('low'),s.mn.m+' · '+s.mn.amt+' '+c],[t('spr'),'+'+((s.mx.amt/s.mn.amt-1)*100).toFixed(0)+'%'],...(s.up?[[t('upk'),s.up.toFixed(2)+' '+c]]:[]),[t('md'),t(M.k)+' (±'+Math.round(M.mae)+')']];
$('pat').innerHTML=`<div class="grid" style="margin-bottom:8px">${ch.map(x=>`<div class="card" style="margin:0;padding:12px"><div class="k">${x[0]}</div><div style="font-weight:700;font-size:15px">${x[1]}</div></div>`).join('')}</div><div class="k" style="margin:10px 0 4px">${t('mch')}</div>`+vi.map((p,j)=>{const d=j?(p[1].amt/vi[j-1][1].amt-1)*100:null;return `<div style="display:flex;align-items:center;gap:8px;margin:6px 0;font-size:12px"><div style="width:64px;color:var(--mu)">${p[1].m||p[0]+1}</div><div style="flex:1;background:var(--bd);border-radius:9px"><div style="width:${p[1].amt/mx*100}%;background:${p[1]===s.mx?'var(--ac)':'var(--bl)'};height:16px;border-radius:9px"></div></div><b style="width:96px;text-align:right">${p[1].amt}${d==null?'':' · '+(d>0?'▲':'▼')+Math.abs(d).toFixed(0)+'%'}</b></div>`}).join('')}
function budget(){const b=+$('pb').value;$('bh2').textContent=b?`${t('pl_b')}: ${b} ${cur()}`:t('bh0');if(!b||!D.fc){$('bo').innerHTML='';return}const c=cur();$('bo').innerHTML=D.fc.map((v,i)=>{const o=v-b;return `<div class="tip" style="background:var(${o>0?'--t3':'--t2'})">+${i+1}: <b>${v} ${c}</b> — <b style="color:${o>0?'#cf6a42':'var(--gr)'}">${o>0?t('bov',o+' '+c):t('bok')}</b></div>`}).join('')}
function dash(){const s=stats(),vi=bills.map((b,i)=>[i,b]).filter(p=>p[1].amt!=null);if(vi.length<3){$('kpi').innerHTML='';$('c1').innerHTML=`<div class="note">${t('need')}</div>`;D={};$('pat').innerHTML='';budget();return}
const c=cur(),M=bestModel(vi.map(p=>p[1].amt)),f=lin(vi.map(p=>p[0]),vi.map(p=>p[1].amt)),L2=bills.length,fc=M.fc,last=vi[vi.length-1][1].amt,prev=vi[vi.length-2][1].amt,mom=prev?((last/prev-1)*100).toFixed(0):null;D={s,fc,slope:Math.round(f.b),err:Math.round(M.mae*1.5),mom,model:M.name,mae:Math.round(M.mae)};
$('kpi').innerHTML=[[t('k1'),s.avg+" "+c,t('ksub',s.n)],[t('k2'),s.mx.amt+" "+c,s.mx.m],[t('k3'),mom==null?"-":(mom>0?"+":"")+mom+"%",""],[t('k4'),fc[0]+" "+c,"±"+D.err]].map(k=>`<div class="card" style="margin:0"><div class="k">${k[0]}</div><div class="v">${k[1]}</div><div class="k">${k[2]}</div></div>`).join('');
const W=640,H=240,p=36,tot=L2+3,bw=(W-p-6)/tot,top=Math.max(...vi.map(q=>q[1].amt),...fc)*1.18,y=v=>H-26-v/top*(H-42);let o=`<svg viewBox="0 0 ${W} ${H}"><line x1="${p}" x2="${W-6}" y1="${y(s.avg)}" y2="${y(s.avg)}" stroke="var(--mu)" stroke-dasharray="3 3"/>`;
for(let i=0;i<tot;i++){const x=p+i*bw+bw*.15,w=bw*.7,F=i>=L2,v=F?fc[i-L2]:bills[i].amt;if(v!=null)o+=`<rect x="${x}" y="${y(v)}" width="${w}" height="${y(0)-y(v)}" rx="6" fill="${F?'var(--ac)':'var(--bl)'}" ${F?'opacity=".55"':''}/><text x="${x+w/2}" y="${y(v)-4}" font-size="9" text-anchor="middle" fill="var(--tx)">${Math.round(v)}</text>`;o+=`<text x="${x+w/2}" y="${H-10}" font-size="9" text-anchor="middle" fill="var(--mu)">${F?'+'+(i-L2+1):(bills[i].m||i+1).slice(0,6)}</text>`}$('c1').innerHTML=o+'</svg>';$('sv').textContent='';pattern(vi,s,M);budget()}
async function summ(){if(!sample)return;if(!D.s){$('sv').textContent=t('need2');return}$('sm').disabled=true;$('sv').textContent=t('th');
try{await sample(`${RULES()}\n\nSummarize the user's electricity usage in 4-5 lines.\n${ctx()}\nTrend changes about ${D.slope} ${cur()} per month. Forecast for next 3 months: ${D.fc.join(', ')} (±${D.err}; ${D.model} model picked by back-testing on ${D.s.n} months, typical error ±${D.mae} - say it is uncertain. Peak month ${D.s.mx.m}, lowest ${D.s.mn.m}: explain possible reasons for the peak as possibilities and give 2-3 practical saving tips). Latest month vs previous: ${D.mom??'unknown'}%.`,{modelTier:"quick",onText:({text})=>{$('sv').textContent=text}})}catch(e){$('sv').textContent=ERR(e)}$('sm').disabled=false}
function ap(){pl()}
const kw=a=>pk(a,a.h);
function est(){const list=apps.map((a,i)=>({i,n:nm(a),kwh:kw(a)})).filter(a=>a.kwh>0),tot=list.reduce((s,a)=>s+a.kwh,0);E=tot?{list,tot}:null;$('insc').hidden=!E;if(!E){$('es').innerHTML=`<div class="card"><div class="note">${t('noapp')}</div></div>`;return}
const s=stats(),pr=+$('price').value||0,mx=Math.max(...list.map(a=>a.kwh));
$('es').innerHTML=`<div class="grid"><div class="card" style="margin:0"><div class="k">${t('e0')}</div><div class="v">${(tot/30).toFixed(1)} kWh</div></div><div class="card" style="margin:0"><div class="k">${t('e1')}</div><div class="v">${tot.toFixed(0)} kWh</div>${pr?`<div class="k">≈ ${(tot*pr).toFixed(0)} ${cur()}</div>`:''}</div>${s&&s.ak?`<div class="card" style="margin:0"><div class="k">${t('e2',s.ak.toFixed(0))}</div><div class="v">${((tot/s.ak-1)*100).toFixed(0)}%</div><div class="k">${t(tot<s.ak*.85?'lo':tot>s.ak*1.15?'hi':'ok')}</div></div>`:''}</div>
<div class="card"><h2>${t('sh')}</h2>${list.map(a=>`<div style="display:flex;align-items:center;gap:8px;margin:6px 0;font-size:12px"><div style="width:110px;color:var(--mu)">${a.n||'?'}</div><div style="flex:1;background:var(--bd);border-radius:9px"><div style="width:${a.kwh/mx*100}%;background:var(--bl);height:18px;border-radius:9px"></div></div><b>${a.kwh.toFixed(0)} kWh · ${(a.kwh/tot*100).toFixed(0)}%</b></div>`).join('')}<div class="note">${t('cn2')}</div></div>`}
async function insights(){if(!sample||!E){if(!sample)$('iv').textContent=t('o1');return}$('ib').disabled=true;$('iv').textContent=t('th');$('tips').innerHTML='';const pr=+$('price').value||0,cp=E.list.map(l=>({...l,w:apps[l.i].w,h:apps[l.i].h,q:apps[l.i].q}));
try{const r=await sample.json(`${RULES()}\n\nAnalyze this household's appliance-based estimate and suggest realistic ways to save electricity. Appliances (id = index): ${cp.map(a=>`[${a.i}] ${a.n}: ${a.w} W, ${a.h} h/day, ${a.q} units, ${a.kwh.toFixed(0)} kWh/month (${(a.kwh/E.tot*100).toFixed(0)}%)`).join('; ')}. Total ${E.tot.toFixed(0)} kWh/month.${stats()&&stats().ak?` Average actual bills ${stats().ak.toFixed(0)} kWh/month.`:''}\nReturn only JSON: {"insight":"2-3 sentences: main finding, e.g. which appliance dominates and whether the estimate matches the bills","tips":[{"i":appliance id,"title":"short action","newHours":number or null,"newWatts":number or null,"why":"one sentence"}]}. Give 3-5 tips, sorted by impact. newHours/newWatts must be lower than the current values and realistic (e.g. an efficient model, fewer hours); null if unchanged. Do not invent savings numbers.`,{modelTier:"default"});
$('iv').textContent=r.insight||'';const tp=(r.tips||[]).map(x=>{const a=apps[+x.i];if(!a)return null;const nh=x.newHours!=null&&+x.newHours<a.h?+x.newHours:a.h,nw=x.newWatts!=null&&+x.newWatts<a.w?+x.newWatts:a.w,sv=kw(a)-pk({...a,w:nw},nh);return sv>0.5?{...x,i:+x.i,nh,nw,sv}:null}).filter(Boolean).sort((a,b)=>b.sv-a.sv);
const cs=v=>pr?` (~${(v*pr).toFixed(0)} ${cur()})`:'',sum=tp.reduce((s,x)=>s+x.sv,0);
$('tips').innerHTML=tp.map((x,j)=>`<div class="tip"><b>${x.title}</b> — ${nm(apps[x.i])}<br>${x.why||''}<br><b class="s">${t('ts',x.sv.toFixed(0),cs(x.sv))}</b> <button class="g" style="font-size:12px;padding:3px 9px;float:right" onclick="applyTip(${x.i},${x.nh},${x.nw},this)">${t('apl')}</button></div>`).join('')+(tp.length?`<div class="note"><b>${t('tot',Math.min(sum,E.tot).toFixed(0),cs(Math.min(sum,E.tot)))}</b></div>`:'')}
catch(e){$('iv').textContent=ERR(e)}$('ib').disabled=false}
function applyTip(i,h,w,b){apps[i].h=h;apps[i].w=w;b.textContent=t('done');b.disabled=true;ap();est()}
function hsum(){est();const s=stats(),pr=+$('price').value||0,c=cur(),ok=s&&s.ak&&E;
const H=[[1,s?t('hs1',s.n,s.avg+' '+c):t('none'),''],[2,s&&s.n>=3?t('hs2'):t('need'),''],[3,E?t('hs3',E.tot.toFixed(0),pr?(E.tot*pr).toFixed(0)+' '+c:'-'):t('noapp'),ok?t(E.tot<s.ak*.85?'lo':E.tot>s.ak*1.15?'hi':'ok'):''],[4,PL?t('hs4',PL.cap.toFixed(0),PL.tot.toFixed(0)):t('pl_ah2'),PL?t(PL.want>PL.cap?'pl_cut':'pl_ok'):'']];
$('hub').innerHTML=H.map(h=>`<div class="card lk" tabindex="0" role="button" onclick="go(${h[0]})" onkeydown="if(event.key==='Enter')go(${h[0]})"><div class="k">${t('n'+h[0])}</div><div style="font-weight:700;font-size:15px;margin:4px 0">${h[1]}</div><div class="k">${h[2]}</div></div>`).join('');
$('pnote').innerHTML=s&&s.up?`${t('hp',s.up.toFixed(2)+' '+c)} <button class="g" style="font-size:12px;padding:3px 9px" onclick="$('price').value=${s.up.toFixed(2)};plan()">${t('hpb')}</button>`:''}
const EM={ac:'❄️',fr:'🧊',fn:'🌀',tv:'📺',lt:'💡',lp:'💻',mo:'🖥️',ch:'🔋',rc:'🍚',kt:'☕',mw:'🍲',hd:'💨',wm:'🧺',gm:'🎮',ir:'👔',wh:'🚿'};
const em=a=>{const k=(a.k||'').replace(/^x_/,'');return EM[k]||EM[{a1:'ac',a2:'fr',a3:'fn',a4:'tv',a5:'lt',a6:'lp'}[k]]||'🔌'};
function put(k){addPre(k);SEL=apps.length-1;SELF=null;room()}
function rmv(){apps.splice(SEL,1);SEL=null;pl()}
let NN=6,HT='dorm',FL=0;const OX=200,OY=120,WH=100;
const IP=(x,y,z=0)=>[OX+(x-y)*20,OY+(x+y)*10-z];
const pg=(p,f,x='')=>`<polygon points="${p.map(q=>q.join(',')).join(' ')}" fill="${f}" ${x}/>`;
const sh=(c,f)=>{const n=parseInt(c.slice(1),16);return '#'+[16,8,0].map(k=>{let v=(n>>k)&255;v=f<1?v*f:v+(255-v)*(f-1);return Math.round(v).toString(16).padStart(2,'0')}).join('')};
const R=(x,y,w,h,c)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
const C=(x,y,r,c,e='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${e}/>`;
const SPR={
ac:[12,w=>R(-14,-12,28,9,'#f1f5f9')+R(-14,-4,28,3,'#cbd5e1')+R(-11,-7,16,1,'#94a3b8')+R(8,-10,3,2,'#38bdf8')],
fr:[38,w=>R(-8,-38,16,38,'#e5e7eb')+R(5,-38,3,38,'#cbd5e1')+R(-8,-26,16,1,'#9ca3af')+R(3,-34,1,6,'#6b7280')+R(3,-22,1,8,'#6b7280')],
fn:[34,w=>C(0,-26,9,'#bfdbfe','stroke="#475569"')+R(-8,-26,16,1,'#475569')+R(-1,-34,2,16,'#475569')+C(0,-26,2,'#334155')+(w?'':R(-1,-17,2,13,'#64748b')+R(-6,-4,12,4,'#475569')),-26],
tv:[20,w=>R(-13,-20,26,16,'#1f2937')+R(-11,-18,22,12,'#38bdf8')+R(-11,-18,8,2,'#bae6fd')+(w?'':R(-3,-4,6,2,'#374151')+R(-7,-2,14,2,'#374151')),-12],
lt:[42,w=>(w?C(0,-27,14,'rgba(253,230,138,.35)'):R(-1,-20,2,17,'#78716c')+R(-5,-4,10,3,'#57534e'))+`<polygon points="-9,-20 9,-20 5,-34 -5,-34" fill="#fde68a" stroke="#ca8a04"/>`,-27],
lp:[14,w=>R(-9,-14,18,10,'#374151')+R(-8,-13,16,8,'#60a5fa')+R(-12,-4,24,3,'#9ca3af')],
mo:[24,w=>R(-11,-22,22,15,'#111827')+R(-10,-21,20,13,'#7dd3fc')+R(-1,-7,2,4,'#6b7280')+R(-6,-3,12,3,'#6b7280')],
ch:[14,w=>R(-3,-14,6,10,'#1f2937')+R(-2,-13,4,7,'#4ade80')+R(-6,-4,12,4,'#e5e7eb')+R(-3,-1,2,1,'#6b7280'),-8],
rc:[17,w=>R(-9,-14,18,4,'#e5e7eb')+R(-8,-10,16,10,'#f9fafb')+R(-1,-17,2,3,'#6b7280')+R(-3,-5,2,2,'#ef4444')+R(-11,-9,2,5,'#9ca3af')+R(9,-9,2,5,'#9ca3af')],
kt:[17,w=>R(-6,-14,12,12,'#dc2626')+R(-5,-17,10,3,'#991b1b')+R(6,-13,4,9,'#7f1d1d')+R(-9,-14,3,2,'#dc2626')+R(-7,-2,14,2,'#374151')],
mw:[16,w=>R(-12,-16,24,16,'#d1d5db')+R(-10,-14,14,12,'#111827')+R(-9,-13,5,3,'#374151')+R(6,-14,4,12,'#9ca3af')+R(7,-12,2,2,'#22c55e')+R(7,-8,2,2,'#f59e0b')],
hd:[16,w=>R(-10,-14,16,8,'#f472b6')+R(-13,-13,3,6,'#9d174d')+R(0,-6,5,7,'#be185d')],
wm:[28,w=>R(-11,-28,22,28,'#f3f4f6')+R(-11,-28,22,5,'#d1d5db')+R(-8,-26,2,2,'#6b7280')+R(4,-26,4,2,'#38bdf8')+C(0,-12,8,'#94a3b8','stroke="#64748b"')+C(0,-12,4.5,'#bfdbfe')],
gm:[9,w=>R(-9,-8,18,7,'#4b5563')+R(-7,-5,5,1.5,'#e5e7eb')+R(-5.2,-7,1.5,5,'#e5e7eb')+C(4,-5,1.6,'#ef4444')+C(7,-5,1.6,'#3b82f6')],
ir:[14,w=>`<polygon points="-11,-2 11,-2 6,-10 -5,-10" fill="#a78bfa"/>`+R(-5,-13,10,3,'#6d28d9')],
_:[14,w=>R(-8,-12,16,12,'#cbd5e1')+`<text y="-3" font-size="10" text-anchor="middle">🔌</text>`]};
let FUR=[],SELF=null,LOCK=0;
const HEAVY=new Set(['fr','wm']),FE={table:'🍽️',desk:'🗄️',tvc:'🗃️',bed:'🛏️',sofa:'🛋️',chair:'🪑',ward:'🚪',shelf:'📚',night:'📦',ctab:'☕'};
const lg=(x,y)=>[x,y,.08,.08,0,13,'#8a5a2b'];
const FM={
table:[1,1,15,[[.1,.1,.8,.8,13,2,'#c08a4b'],lg(.12,.12),lg(.8,.12),lg(.12,.8),lg(.8,.8)]],
desk:[2,1,15,[[.05,.1,1.9,.8,13,2,'#d9a96b'],lg(.08,.12),lg(1.84,.12),lg(.08,.8),lg(1.84,.8),[.1,.12,1.8,.04,3,10,'#c08a4b']]],
tvc:[2,1,12,[[.05,.15,1.9,.7,0,12,'#8a6a4a'],[.1,.85,.85,.02,2,8,'#6d5238'],[1.05,.85,.85,.02,2,8,'#6d5238'],[.9,.85,.05,.03,6,3,'#d4d4d8'],[1.05,.85,.05,.03,6,3,'#d4d4d8']]],
bed:[1,2,12,[[.05,.05,.9,1.9,0,5,'#8d6e63'],[.1,.1,.8,1.8,5,6,'#e5e7eb'],[.1,.7,.8,1.2,11,1,'#ef4444'],[.2,.12,.6,.35,11,3,'#ffffff'],[.05,.05,.9,.06,5,12,'#6d4c41']]],
sofa:[2,1,7,[[.05,.15,1.9,.8,0,7,'#5b7db1'],[.05,.1,1.9,.2,7,9,'#4a6b9e'],[.05,.3,.2,.65,7,5,'#4a6b9e'],[1.75,.3,.2,.65,7,5,'#4a6b9e']]]};
const lq=(x,y)=>[x,y,.07,.07,0,6,'#7c5a35'];
Object.assign(FM,{
chair:[1,1,7,[lq(.2,.2),lq(.73,.2),lq(.2,.73),lq(.73,.73),[.18,.18,.64,.64,6,2,'#d9a96b'],[.18,.18,.64,.08,8,10,'#c08a4b']]],
ward:[2,1,45,[[.05,.1,1.9,.8,0,45,'#c9a27a'],[.05,.9,.93,.02,2,41,'#a47b52'],[1.02,.9,.93,.02,2,41,'#a47b52'],[.9,.9,.04,.04,20,6,'#6b7280'],[1.06,.9,.04,.04,20,6,'#6b7280']]],
shelf:[2,1,32,[[.05,.2,1.9,.7,0,32,'#b98b5b'],[.1,.9,1.8,.02,2,13,'#7c5a35'],[.1,.9,1.8,.02,17,13,'#7c5a35'],[.15,.9,.15,.04,2,11,'#ef4444'],[.32,.9,.12,.04,2,9,'#3b82f6'],[.5,.9,.15,.04,17,11,'#22c55e'],[.7,.9,.12,.04,17,9,'#f59e0b']]],
night:[1,1,10,[[.15,.15,.7,.7,0,10,'#d9a96b'],[.2,.85,.6,.02,5,4,'#a47b52'],[.45,.85,.1,.03,6,2,'#6b7280']]],
ctab:[2,1,8,[[.1,.15,1.8,.7,6,2,'#e7d3b0'],[.15,.2,.07,.07,0,6,'#8a5a2b'],[1.78,.2,.07,.07,0,6,'#8a5a2b'],[.15,.73,.07,.07,0,6,'#8a5a2b'],[1.78,.73,.07,.07,0,6,'#8a5a2b']]]});
const fdim=f=>{const W=f.sw||FM[f.t][0],D=f.sd||FM[f.t][1];return f.r&1?[D,W]:[W,D]};
const cov=(f,x,y)=>{const[w,d]=fdim(f);return x>=f.gx&&x<f.gx+w&&y>=f.gy&&y<f.gy+d};
const fAt=(x,y)=>FUR.find(f=>(f.fl||0)==FL&&cov(f,x,y)),zOf=a=>{const f=a.m?null:fAt(a.gx,a.gy);return f?FM[f.t][2]:0};
const fk=f=>{const[w,d]=fdim(f);return f.gx+f.gy+(w+d)/2};
const fok=(g,f)=>{const[w,d]=fdim(g);if(g.gx<0||g.gy<0||g.gx+w>NN||g.gy+d>NN)return 0;
if(blk(g))return 0;for(const o of FUR)if(o!==f&&(o.fl||0)==FL){const[w2,d2]=fdim(o);if(g.gx<o.gx+w2&&o.gx<g.gx+w&&g.gy<o.gy+d2&&o.gy<g.gy+d)return 0}
return !apps.some(a=>(a.fl||0)==FL&&!a.m&&cov(g,a.gx,a.gy)&&!(f&&cov(f,a.gx,a.gy)))};
const fh=(f,i)=>{const[W,D,T,B]=FM[f.t],[w,d]=fdim(f);return `<g data-f="${i}" style="cursor:grab" filter="url(#stk)">${B.map(b=>bx(sb(b,W,D,f.sw||W,f.sd||D),f.r,f.gx,f.gy,f.sw||W,f.sd||D,0)).sort((p,q)=>p[0]-q[0]).map(b=>b[1]).join('')}</g>`+(SELF==i?pg([IP(f.gx,f.gy,T),IP(f.gx+w,f.gy,T),IP(f.gx+w,f.gy+d,T),IP(f.gx,f.gy+d,T)],'rgba(255,212,59,.3)','stroke="#ffd43b" stroke-width="2" pointer-events="none"'):'')};
function putF(t){const c=[];for(let y=0;y<NN;y++)for(let x=0;x<NN;x++)c.push([x,y]);const d=p=>Math.abs(p[0]-NN/2+.5)+Math.abs(p[1]-NN/2+.5);c.sort((p,q)=>d(p)-d(q));
for(const[x,y]of c){const g={t,r:0,gx:x,gy:y,fl:FL};if(fok(g,null)){FUR.push(g);SELF=FUR.length-1;SEL=null;room();return}}}
function rotF(){const f=FUR[SELF];if(!f)return;const g={t:f.t,gx:f.gx,gy:f.gy,r:(f.r+1)%4,sw:f.sw,sd:f.sd},[w,d]=fdim(g);g.gx=Math.min(g.gx,NN-w);g.gy=Math.min(g.gy,NN-d);if(fok(g,f)){f.r=g.r;f.gx=g.gx;f.gy=g.gy;room()}}
function rmF(){FUR.splice(SELF,1);SELF=null;room()}
let DEC=1,PT=0;
const sb=(b,W,D,SW,SD)=>{const m=(e,S,T)=>e>S/2?e+T:e,x0=m(b[0],W,SW-W),x1=m(b[0]+b[2],W,SW-W),y0=m(b[1],D,SD-D),y1=m(b[1]+b[3],D,SD-D);return[x0,y0,x1-x0,y1-y0,b[4],b[5],b[6]]};
function sizeF(ax,dl){const f=FUR[SELF];if(!f)return;const W=f.sw||FM[f.t][0],D=f.sd||FM[f.t][1],g={t:f.t,r:f.r,gx:f.gx,gy:f.gy,sw:W,sd:D};
if(ax)g.sd=Math.max(1,Math.min(5,D+dl));else g.sw=Math.max(1,Math.min(5,W+dl));
const[w,d]=fdim(g);g.gx=Math.min(g.gx,NN-w);g.gy=Math.min(g.gy,NN-d);if(fok(g,f)){f.sw=g.sw;f.sd=g.sd;f.gx=g.gx;f.gy=g.gy;room()}}
const bt=(f,l)=>`<button class="g sm" onclick="${f}">${l}</button>`;
function fsel(){const f=FUR[SELF];return `<b>${FE[f.t]} ${t('f_'+f.t)}</b><span class="note" style="margin:0">${fdim(f).join('×')}</span><span class="sp"></span>${t('rm_w')} ${bt('sizeF(0,-1)','−')}${bt('sizeF(0,1)','+')} ${t('rm_dp')} ${bt('sizeF(1,-1)','−')}${bt('sizeF(1,1)','+')} ${bt('rotF()','🔄 '+t('rm_rot'))} ${bt('rmF()','🗑 '+t('rm_r'))}`}
const MOD={
wh:[[.25,.25,.5,.5,0,26,'#f8fafc'],[.35,.74,.3,.02,10,4,'#38bdf8'],[.45,.3,.1,.1,26,4,'#94a3b8']],
fr:[[.2,.2,.6,.6,0,40,'#e5e7eb'],[.2,.78,.6,.03,24,1.5,'#9ca3af'],[.62,.8,.04,.03,28,8,'#6b7280'],[.62,.8,.04,.03,10,10,'#6b7280']],
fn:[[.3,.3,.4,.4,0,2.5,'#475569'],[.47,.47,.06,.06,2.5,17,'#64748b'],[.4,.4,.2,.18,18,8,'#64748b'],['d',.5,.6,28,11,.1]],
tv:[[.3,.4,.4,.2,0,2,'#374151'],[.46,.46,.08,.08,2,6,'#374151'],[.3,.36,.4,.07,12,14,'#1f2937'],[0,.43,1,.14,8,24,'#111827'],[.05,.57,.9,.02,10.5,19,'#7dd3fc'],[.05,.57,.9,.03,10.5,6,'#4ade80'],[.2,.57,.18,.035,20,5,'#fde047'],[.85,.57,.04,.035,8.6,1.2,'#ef4444']],
lt:[[.38,.38,.24,.24,0,2,'#57534e'],[.47,.47,.06,.06,2,22,'#78716c'],[.32,.32,.36,.36,24,12,'#fde68a'],[.4,.4,.2,.2,36,2,'#ca8a04']],
lp:[[.15,.2,.7,.5,0,2,'#9ca3af'],[.15,.2,.7,.04,2,16,'#374151'],[.18,.24,.64,.01,4,12,'#60a5fa'],[.2,.4,.6,.2,2,1,'#d1d5db']],
mo:[[.35,.4,.3,.2,0,2,'#6b7280'],[.47,.47,.06,.06,2,6,'#6b7280'],[.12,.44,.76,.12,8,18,'#111827'],[.16,.55,.68,.02,10,14,'#7dd3fc']],
ch:[[.3,.3,.4,.3,0,3,'#e5e7eb'],[.38,.52,.24,.05,3,12,'#1f2937'],[.4,.57,.2,.01,5,8,'#4ade80']],
rc:[[.25,.25,.5,.5,0,13,'#f9fafb'],[.23,.23,.54,.54,13,4,'#e5e7eb'],[.46,.46,.08,.08,17,3,'#6b7280'],[.45,.74,.1,.03,5,2,'#ef4444'],[.18,.4,.07,.2,6,3,'#9ca3af'],[.75,.4,.07,.2,6,3,'#9ca3af']],
kt:[[.28,.28,.44,.44,0,2,'#374151'],[.3,.3,.4,.4,2,12,'#dc2626'],[.35,.35,.3,.3,14,3,'#991b1b'],[.7,.42,.1,.16,4,11,'#7f1d1d'],[.2,.42,.1,.16,10,2,'#dc2626']],
mw:[[.12,.2,.76,.6,0,16,'#d1d5db'],[.18,.8,.45,.02,3,10,'#111827'],[.68,.8,.16,.02,3,10,'#9ca3af'],[.72,.8,.08,.03,10,2,'#22c55e']],
hd:[[.2,.35,.5,.3,6,8,'#f472b6'],[.1,.4,.1,.2,7,6,'#9d174d'],[.55,.42,.12,.16,0,6,'#be185d']],
wm:[[.15,.15,.7,.7,0,30,'#f3f4f6'],[.15,.85,.7,.02,24,6,'#d1d5db'],[.28,.85,.44,.03,6,16,'#94a3b8'],[.34,.88,.32,.01,9,10,'#bfdbfe'],[.2,.85,.06,.03,26,2,'#6b7280']],
gm:[[.2,.25,.6,.5,0,5,'#1f2937'],[.25,.45,.5,.3,5,2,'#4b5563'],[.6,.55,.05,.05,7,1,'#ef4444'],[.68,.55,.05,.05,7,1,'#3b82f6'],[.3,.58,.1,.04,7,1,'#e5e7eb'],[.33,.55,.04,.1,7,1,'#e5e7eb'],[.65,.75,.1,.02,2,2,'#38bdf8']],
ir:[[.2,.3,.6,.4,0,3,'#a78bfa'],[.3,.32,.4,.36,3,5,'#8b5cf6'],[.35,.4,.3,.2,8,4,'#6d28d9']],
_:[[.25,.25,.5,.5,0,12,'#cbd5e1'],[.38,.75,.06,.03,6,3,'#6b7280'],[.56,.75,.06,.03,6,3,'#6b7280']]};
const rp=(x,y,r,W=1,D=1)=>[[x,y],[D-y,x],[W-x,D-y],[y,W-x]][r];
const bx=(b,r,gx,gy,W=1,D=1,zo=0)=>{const[a1,a2]=rp(b[0],b[1],r,W,D),[b1,b2]=rp(b[0]+b[2],b[1]+b[3],r,W,D),x0=gx+Math.min(a1,b1),x1=gx+Math.max(a1,b1),y0=gy+Math.min(a2,b2),y1=gy+Math.max(a2,b2),z0=b[4]+zo,z1=z0+b[5],c=b[6],e='stroke="rgba(0,0,0,.18)" stroke-width=".5"';
return[x0+x1+y0+y1+z0*.002,pg([IP(x0,y1,z0),IP(x1,y1,z0),IP(x1,y1,z1),IP(x0,y1,z1)],c,e)+pg([IP(x1,y0,z0),IP(x1,y1,z0),IP(x1,y1,z1),IP(x1,y0,z1)],sh(c,.72),e)+pg([IP(x0,y0,z1),IP(x1,y0,z1),IP(x1,y1,z1),IP(x0,y1,z1)],sh(c,1.3),e)]};
function rot(){const a=apps[SEL];if(a&&!a.m){a.r=((a.r||0)+1)%4;room()}}
const WM={ac:'w',tv:'b',lt:'b',fn:'b',ch:'b'};
const sk=a=>{const k=(a.k||'').replace(/^x_/,'');return {a1:'ac',a2:'fr',a3:'fn',a4:'tv',a5:'lt',a6:'lp'}[k]||k};
const discSVG=(cx,cy,cz,rho,th,ax,sg)=>{const Rt=rho/22,N=18,pa=(A,f,o)=>{const u=Rt*f*Math.cos(A),v=rho*f*Math.sin(A);return ax=='y'?IP(cx+u,cy+o,cz+v):IP(cx+o,cy+u,cz+v)},ring=(f,o)=>Array.from({length:N},(_,k)=>pa(k/N*6.2832,f,o));
let h='';for(let i=0;i<3;i++)h+=pg(ring(1,th*(i/3-.5)),'#64748b');const o=th/2;
h+=pg(ring(1,o),sg>0?'#e0f2fe':'#cbd5e1','stroke="#475569" stroke-width=".8"');
if(sg>0){for(let k=0;k<3;k++){const p=k*2.0944+.6;h+=pg([pa(0,0,o),pa(p-.45,.92,o),pa(p+.45,.92,o)],'#7dd3fc')}h+=pg(ring(.55,o),'none','stroke="#475569" stroke-width=".6"')}
else h+=pg(ring(.5,o),'none','stroke="#64748b" stroke-width=".6"');
return h+pg(ring(.16,o),sg>0?'#334155':'#64748b')};
const mk=(b,r,gx,gy,W,D,zo)=>{if(b[0]!='d')return bx(b,r,gx,gy,W,D,zo);const[c1,c2]=rp(b[1],b[2],r,W,D),cx=gx+c1,cy=gy+c2;return[2*cx+2*cy+(b[3]+zo)*.002,discSVG(cx,cy,b[3]+zo,b[4],b[5],r&1?'x':'y',(r==0||r==3)?1:-1)]};
const WMOD={
ac:[[-.15,0,1.3,.34,-5,10,'#f8fafc'],[-.1,.2,1.2,.2,-8,3,'#94a3b8'],[-.1,.04,1.1,.12,5,1.2,'#e2e8f0'],[0,.34,.7,.03,-1,1,'#cbd5e1'],[.9,.34,.1,.03,0,3,'#38bdf8']],
tv:[[.4,0,.2,.07,-3,6,'#6b7280'],[-.1,.06,1.2,.14,-12,24,'#111827'],[-.05,.2,1.1,.02,-9,18,'#7dd3fc'],[-.05,.2,1.1,.03,-9,6,'#4ade80'],[.15,.2,.2,.035,0,5,'#fde047']],
fn:[[.46,0,.08,.4,-2,4,'#64748b'],['d',.5,.45,0,11,.1]],
lt:[[.35,0,.3,.08,-4,8,'#78716c'],[.25,.08,.5,.3,-2,12,'#fde68a']],
ch:[[.2,0,.6,.06,-6,12,'#f1f5f9'],[.35,.06,.3,.2,-3,6,'#e5e7eb'],[.45,.26,.1,.02,0,2,'#4ade80']]};
function wallSVG(a,i){const L=a.m=='l',u0=a.gx,zc=a.z,M=MV(a,WMOD[sk(a)],1),W=(u,p,z)=>L?IP(p,u0+u,zc+z):IP(u0+u,p,zc+z),bs=[];
const hl=SEL==i?pg([W(-.15,0,-14),W(1.15,0,-14),W(1.15,0,14),W(-.15,0,14)],'rgba(255,212,59,.35)','stroke="#ffd43b" stroke-width="2" pointer-events="none"'):'';
M.forEach(b=>{if(b[0]=='d'){const c=L?[b[2],u0+b[1]]:[u0+b[1],b[2]];bs.push([2*c[0]+2*c[1]+(zc+b[3])*.002,discSVG(c[0],c[1],zc+b[3],b[4],b[5],L?'x':'y',1)])}
else{const[u,p,wu,wp,z,h,c]=b;bs.push(bx(L?[p,u0+u,wp,wu,z,h,c]:[u0+u,p,wu,wp,z,h,c],0,0,0,1,1,zc))}});
return `<g data-k="${i}" style="cursor:grab" filter="url(#stk)">${hl}${bs.sort((p,q)=>p[0]-q[0]).map(b=>b[1]).join('')}</g>`}
const HEX=()=>`M${IP(0,0,WH)} L${IP(0,NN,WH)} L${IP(0,NN,-8)} L${IP(NN,NN,-8)} L${IP(NN,0,-8)} L${IP(NN,0,WH)} Z`;
const DEFS=()=>`<defs><filter id="stk" x="-30%" y="-30%" width="160%" height="160%"><feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="d"/><feFlood flood-color="#fff" result="f"/><feComposite in="f" in2="d" operator="in" result="w"/><feDropShadow in="w" dx="1" dy="2.5" stdDeviation="1.6" flood-color="#000" flood-opacity=".28" result="s"/><feMerge><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="sh" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#6b4a1f" flood-opacity=".3"/></filter></defs><path d="${HEX()}" fill="#fff" stroke="#fff" stroke-width="9" stroke-linejoin="round" filter="url(#sh)"/>`;
const blk=()=>0,zf=()=>'',zo=()=>[],zt=()=>'';
function room(){if(SEL!=null&&!apps[SEL])SEL=null;if(SELF!=null&&!FUR[SELF])SELF=null;$('lk').textContent=(LOCK?'🔒 ':'🔓 ')+t(LOCK?'rm_lk1':'rm_lk0');$('lk').style.background=LOCK?'var(--pr)':'';
apps.forEach(a=>{if(a.gx!=null)return;
if(WM[sk(a)]=='w'){for(const[m,g]of[['r',NN-1],['l',0],['l',NN-1],['r',0],['r',1],['l',1]])if(a.gx==null&&!apps.some(o=>o!==a&&(o.fl||0)==(a.fl||0)&&o.m==m&&o.gx==g)){a.m=m;a.gx=g;a.gy=0;a.z=72}}
if(a.gx==null){const c=[];for(let y=0;y<NN;y++)for(let x=0;x<NN;x++)c.push([x,y]);const d=p=>Math.abs(p[0]-NN/2+.5)+Math.abs(p[1]-NN/2+.5);c.sort((p,q)=>d(p)-d(q));const f=c.find(([x,y])=>!apps.some(b=>b!==a&&(b.fl||0)==(a.fl||0)&&!b.m&&b.gx==x&&b.gy==y)&&!(HEAVY.has(sk(a))&&fAt(x,y)))||c[0];a.gx=f[0];a.gy=f[1]}});
let o=DEFS()+pg([IP(0,NN),IP(NN,NN),IP(NN,NN,-8),IP(0,NN,-8)],'#e5e1d8')+pg([IP(NN,0),IP(NN,NN),IP(NN,NN,-8),IP(NN,0,-8)],'#cfcbc2')
+pg([IP(0,0),IP(0,NN),IP(0,NN,WH),IP(0,0,WH)],RC.l)+pg([IP(0,0),IP(NN,0),IP(NN,0,WH),IP(0,0,WH)],RC.r)+wst()
+(DEC?pg([IP(0,1.5,45),IP(0,4.5,45),IP(0,4.5,85),IP(0,1.5,85)],'#bfe3f2','stroke="#fff" stroke-width="2"')
+pg([IP(1,0,58),IP(4.5,0,58),IP(4.5,0,62),IP(1,0,62)],'#a9744f')
+pg([IP(1.4,0,62),IP(1.8,0,62),IP(1.8,0,76),IP(1.4,0,76)],'#d62828')+pg([IP(1.8,0,62),IP(2.2,0,62),IP(2.2,0,72),IP(1.8,0,72)],'#277da1')+pg([IP(2.2,0,62),IP(2.6,0,62),IP(2.6,0,74),IP(2.2,0,74)],'#90be6d'):'')
+pg([IP(0,0),IP(NN,0),IP(NN,NN),IP(0,NN)],RC.f);
if(RC.fs=='tile')for(let x=0;x<NN;x++)for(let y=0;y<NN;y++)if((x+y)%2)o+=pg([IP(x,y),IP(x+1,y),IP(x+1,y+1),IP(x,y+1)],sh(RC.f,.9));
for(let i=0;i<=NN;i++)o+=`<path d="M${IP(i,0)} L${IP(i,NN)}${RC.fs=='wood'?'':` M${IP(0,i)} L${IP(NN,i)}`}" stroke="rgba(90,60,30,.28)" fill="none"/>`;
o+=zf();
o+=`<path d="M${IP(0,0,WH)} L${IP(0,NN,WH)} L${IP(0,NN,-8)} L${IP(NN,NN,-8)} L${IP(NN,0,-8)} L${IP(NN,0,WH)} Z" fill="none" stroke="#f4f1ea" stroke-width="3" stroke-linejoin="round"/>`;
const s=apps[SEL];
const it=i=>{const a=apps[i],[h,f,wy]=SPR[sk(a)]||SPR._;
if(a.m&&WMOD[sk(a)])return wallSVG(a,i);
if(a.m){const[X,Y]=a.m=='l'?IP(0,a.gx+.5,a.z):IP(a.gx+.5,0,a.z),w0=wy??-h/2;
return `<g data-k="${i}" transform="matrix(1,${a.m=='l'?-.5:.5},0,1,${X},${Y})" style="cursor:grab" filter="url(#stk)"><g transform="translate(0,${-w0})">${SEL==i?`<rect x="-17" y="${w0-13}" width="34" height="26" fill="rgba(255,212,59,.3)" stroke="#ffd43b" stroke-width="2"/>`:''}${R(-15,w0-13,30,26,'transparent')}<g shape-rendering="crispEdges">${f(1)}</g></g></g>`}
const[X,Y]=IP(a.gx+.5,a.gy+.5),k=sk(a),M=MOD[k]||(SPR[k]?null:MOD._);
if(M){const r=a.r||0;return `<g data-k="${i}" style="cursor:grab" filter="url(#stk)">${MV(a,M).map(b=>mk(b,r,a.gx,a.gy,1,1,zOf(a))).sort((p,q)=>p[0]-q[0]).map(b=>b[1]).join('')}</g>`}
return `<g data-k="${i}" transform="translate(${X},${Y})" style="cursor:grab" filter="url(#stk)"><ellipse rx="12" ry="5" fill="rgba(0,0,0,.2)"/>${R(-14,-h-2,28,h+4,'transparent')}<g shape-rendering="crispEdges">${f(0)}</g></g>`};
const ak=a=>{const f=fAt(a.gx,a.gy),k=a.gx+a.gy+1;return f?Math.max(k,fk(f))+.01:k},ob=[];
FUR.forEach((f,i)=>{if((f.fl||0)==FL)ob.push([fk(f),fh(f,i)])});apps.forEach((a,i)=>{if(!a.m&&(a.fl||0)==FL)ob.push([ak(a),it(i)])});ob.push(...zo());
if(s&&!s.m){const z=zOf(s);ob.push([ak(s)-.005,pg([IP(s.gx,s.gy,z),IP(s.gx+1,s.gy,z),IP(s.gx+1,s.gy+1,z),IP(s.gx,s.gy+1,z)],'rgba(255,212,59,.45)','stroke="#ffd43b" stroke-width="2" pointer-events="none"')])}
o+=apps.map((a,i)=>a.m&&(a.fl||0)==FL?it(i):'').join('')+ob.sort((p,q)=>p[0]-q[0]).map(x=>x[1]).join('');
o+=zt();if(!apps.length&&!FUR.length)o+=`<text x="200" y="215" font-size="11" text-anchor="middle" fill="#6b4a2b">${t('rm_e')}</text>`;
if(RT){RT.innerHTML=o.replace(/#stk/g,'#vstk').replace(/#sh\)/g,'#vsh)').replace('id="stk"','id="vstk"').replace('id="sh"','id="vsh"');return}$('room').innerHTML=o;
const tot=apps.reduce((q,x)=>q+kw(x),0);
const pr=+$('price').value||0,bg=+$('pb').value||0,cu=cur(),cost=tot*pr;
$('chips').innerHTML=`<div class="chip2"><span>⚡</span><div><b>${tot.toFixed(0)}</b> kWh<small>${t('ch_m')}</small></div></div><div class="chip2"><span>💰</span><div><b>${cost.toFixed(0)}</b> ${cu}<small>${t('ch_c')}</small></div></div><div class="chip2${bg&&cost>bg?' bad':''}"><span>🎯</span><div><b>${bg||'-'}</b> ${bg?cu:''}<small>${bg?(cost>bg?t('ch_over'):t('ch_ok')):t('ch_nobud')}</small></div></div>`;
mini();$('rsel').innerHTML=FUR[SELF]?fsel():s?`<b>${em(s)} ${nm(s)||'?'}</b> · ${kw(s).toFixed(0)} kWh ${mSel(s,SEL)} ${s.m?'':`<button class="g" style="padding:4px 10px" onclick="rot()">🔄 ${t('rm_rot')}</button> `}<button class="g" style="padding:4px 10px" onclick="$('dtl').open=true;$('dtl').scrollIntoView({behavior:'smooth'})">✏️ ${t('rm_e2')}</button> <button class="g" style="padding:4px 10px" onclick="rmv()">🗑 ${t('rm_r')}</button>`:`<span class="note" style="margin:0">${t('rm_h')}</span>`;
$('tA').className='tab'+(PT?'':' on');$('tF').className='tab'+(PT?' on':'');
$('pal').innerHTML=PT?Object.keys(FM).map(k=>`<button class="pi" onclick="putF('${k}')"><b>${FE[k]}</b>${t('f_'+k)}</button>`).join(''):PRE.map(p=>`<button class="pi" onclick="put('${p[0]}')"><b>${EM[p[0]]}</b>${t('x_'+p[0])}<small>${p[3]} W</small></button>`).join('')+`<button class="pi" onclick="put('o')"><b>🔌</b>${t('rm_o')}</button>`}
let DR=null;const RM=$('room');
const loc=e=>{const p=RM.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(RM.getScreenCTM().inverse()),A=(OX-q.x)/20,B=(q.x-OX)/20;
if(q.x<OX&&A<NN){const z=OY+A*10-q.y;if(z>=0&&z<=WH)return{m:'l',g:Math.floor(A),z}}
if(q.x>=OX&&B<NN){const z=OY+B*10-q.y;if(z>=0&&z<=WH)return{m:'r',g:Math.floor(B),z}}
const dx=(q.x-OX)/20,dy=(q.y+14-OY)/10;return{m:'',g:Math.floor((dx+dy)/2),h:Math.floor((dy-dx)/2)}};
RM.addEventListener('pointerdown',e=>{const g=e.target.closest('[data-k],[data-f]');if(!g)return;const F=g.dataset.f!=null;DR={F,i:+(F?g.dataset.f:g.dataset.k),x:e.clientX,y:e.clientY,m:0};try{RM.setPointerCapture(e.pointerId)}catch(_){}e.preventDefault()});
RM.addEventListener('pointermove',e=>{if(!DR||LOCK)return;if(Math.hypot(e.clientX-DR.x,e.clientY-DR.y)>4)DR.m=1;if(!DR.m)return;const L=loc(e);
if(DR.F){if(L.m)return;const f=FUR[DR.i],[w,d]=fdim(f),gx=Math.max(0,Math.min(NN-w,L.g-(w>>1))),gy=Math.max(0,Math.min(NN-d,L.h-(d>>1))),g={t:f.t,r:f.r,gx,gy,sw:f.sw,sd:f.sd};if((gx==f.gx&&gy==f.gy)||!fok(g,f))return;
const dx=gx-f.gx,dy=gy-f.gy;apps.forEach(a=>{if((a.fl||0)==FL&&!a.m&&cov(f,a.gx,a.gy)){a.gx+=dx;a.gy+=dy}});f.gx=gx;f.gy=gy;SELF=DR.i;SEL=null;room();return}
const a=apps[DR.i],wm=WM[sk(a)]||'';
if(L.m){if(!wm)return;const z=Math.max(25,Math.min(88,Math.round(L.z/5)*5));if(apps.some(o=>o!==a&&(o.fl||0)==FL&&o.m==L.m&&o.gx==L.g&&Math.abs(o.z-z)<18))return;a.m=L.m;a.gx=L.g;a.gy=0;a.z=z}
else{if(wm=='w'||L.g<0||L.h<0||L.g>=NN||L.h>=NN||apps.some(o=>o!==a&&(o.fl||0)==FL&&!o.m&&o.gx==L.g&&o.gy==L.h)||(HEAVY.has(sk(a))&&fAt(L.g,L.h)))return;a.m='';a.gx=L.g;a.gy=L.h}
SEL=DR.i;SELF=null;room()});
RM.addEventListener('pointerup',()=>{if(!DR)return;const{F,i,m}=DR;DR=null;if(F){SELF=i;SEL=null;room();return}SEL=i;SELF=null;if(m)room();else{apps.forEach((a,j)=>a.open=j==i);pl()}});
let PL=null;
const pk=(a,h)=>(a.w||0)*h*(a.q||0)*((a.d??100)/100)/1000*30;
const MDL={
ac:[['d9','Daikin Sabai Inverter 9,000 BTU',700,70,{z:.9,c:{'#94a3b8':'#60a5fa'}}],['m12','Mitsubishi Electric Happy Inverter 12,000 BTU',950,70,{c:{'#38bdf8':'#ef4444','#94a3b8':'#6b7280'}}],['lg','LG DUAL Inverter 12,000 BTU (black)',950,70,{c:{'#f8fafc':'#1f2937','#e2e8f0':'#374151','#cbd5e1':'#111827','#38bdf8':'#a7f3d0'}}],['sj','Saijo Denki 12,000 BTU (non-inverter)',1200,70,{z:1.1,c:{'#f8fafc':'#fef9c3','#e2e8f0':'#fde68a'}}]],
fr:[['mn','Sharp mini 1-door (~4 Q)',50,40,{z:.6,c:{'#e5e7eb':'#f9fafb'}}],['tb','Toshiba Inverter 2-door (~7 Q)',90,40,{z:1.1,c:{'#e5e7eb':'#cbd5e1','#9ca3af':'#64748b'}}],['sb','Samsung Side-by-Side (~20 Q)',180,40,{z:1.3,c:{'#e5e7eb':'#374151','#9ca3af':'#6b7280'},x:[[.49,.8,.02,.03,2,50,'#0f172a']]}]],
tv:[['xm','Xiaomi TV A 32"',40,100,{z:.8,c:{'#7dd3fc':'#86efac'}}],['sg','Samsung Crystal UHD 43"',80,100,{}],['lg','LG OLED 55"',120,100,{z:1.15,c:{'#7dd3fc':'#c4b5fd','#111827':'#020617'}}]],
fn:[['ht','Hatari 16" stand fan',55,100,{}],['xm','Xiaomi Smart Standing Fan',25,100,{z:.9,c:{'#475569':'#e5e7eb','#64748b':'#f8fafc'}}],['tw','Tower fan 40"',45,100,{B:[[.3,.3,.4,.4,0,2,'#374151'],[.34,.34,.32,.32,2,32,'#f3f4f6'],[.38,.66,.24,.02,8,22,'#9ca3af'],[.44,.66,.12,.02,32,1,'#38bdf8']],c:{'#475569':'#374151'}}]],
wm:[['hf','Haier 7 kg top-load',300,100,{B:[[.15,.15,.7,.7,0,30,'#f3f4f6'],[.15,.15,.7,.7,30,2,'#d1d5db'],[.2,.3,.6,.5,32,1,'#bfdbfe'],[.2,.17,.2,.08,32,1,'#38bdf8'],[.5,.17,.3,.08,32,1,'#6b7280']]}],['sf','Samsung 8 kg front-load',450,100,{}],['lg','LG Inverter Direct Drive 9 kg (graphite)',500,100,{z:1.1,c:{'#f3f4f6':'#52525b','#d1d5db':'#3f3f46'}}]],
gm:[['ps','PlayStation 5',200,100,{B:[[.3,.35,.4,.3,0,2,'#e5e7eb'],[.4,.4,.2,.2,2,24,'#f8fafc'],[.36,.4,.04,.2,2,24,'#111827'],[.6,.4,.04,.2,2,24,'#111827'],[.45,.6,.1,.01,10,3,'#3b82f6']]}],['xb','Xbox Series X',160,100,{B:[[.3,.3,.4,.4,0,17,'#111827'],[.42,.42,.16,.16,17,1,'#22c55e']]}],['sw','Nintendo Switch (docked)',25,100,{B:[[.25,.4,.5,.2,0,9,'#e5e7eb'],[.3,.6,.4,.01,1,7,'#111827'],[.3,.6,.1,.011,1,7,'#ef4444'],[.6,.6,.1,.011,1,7,'#38bdf8']]}]],
rc:[['sh','Sharp 1.8 L',650,100,{c:{'#f9fafb':'#fbcfe8','#e5e7eb':'#f9a8d4'}}],['tb','Toshiba IH 1.0 L',450,100,{z:.85,c:{'#f9fafb':'#1f2937','#e5e7eb':'#111827'}}]]};
const mdl=a=>(MDL[sk(a)]||[]).find(m=>m[0]==a.mo);
const MV=(a,B,w)=>{const v=(mdl(a)||[])[4];if(!v)return B;if(v.B&&!w)return v.B;const z=v.z||1,c=v.c||{};return B.map(b=>b[0]=='d'?['d',b[1],b[2],b[3]*z,b[4],b[5]]:[b[0],b[1],b[2],b[3],b[4]*z,b[5]*z,c[b[6]]||b[6]]).concat(w?[]:v.x||[])};
const mSel=(a,i)=>{const l=MDL[sk(a)];return l?`<select style="max-width:200px;padding:5px 8px;font-size:13px" onchange="setMo(${i},this.value)"><option value="">${t('md0')}</option>${l.map(m=>`<option value="${m[0]}" ${a.mo==m[0]?'selected':''}>${m[1]} · ${m[2]}W</option>`).join('')}</select>`:''};
function setMo(i,v){const a=apps[i];a.mo=v;const m=mdl(a),p=PRE.find(x=>x[0]==sk(a));if(m){a.w=m[2];a.d=m[3]}else if(p){a.w=p[3];a.d=p[7]}pl()}
const PRE=[["ac","แอร์","A/C",900,8,1,2,70],["fr","ตู้เย็น","Fridge",55,24,1,1,40],["fn","พัดลม","Fan",50,8,1,2,100],["tv","ทีวี","TV",100,4,1,3,100],["lt","หลอดไฟ","Light",10,6,1,2,100],["lp","โน้ตบุ๊ก","Laptop",60,6,1,1,100],["mo","จอคอม","Monitor",30,6,1,2,100],["ch","ที่ชาร์จมือถือ","Phone charger",10,3,1,1,100],["rc","หม้อหุงข้าว","Rice cooker",600,1,1,2,100],["kt","กาต้มน้ำ","Kettle",1500,.3,1,3,100],["mw","ไมโครเวฟ","Microwave",1000,.3,1,3,100],["hd","ไดร์เป่าผม","Hair dryer",1200,.3,1,3,100],["wm","เครื่องซักผ้า","Washer",400,.5,1,3,100],["gm","เกมคอนโซล","Game console",150,3,1,3,100],["ir","เตารีด","Iron",1000,.2,1,3,100],["wh","เครื่องทำน้ำอุ่น","Water heater",3500,.3,1,3,100]];
PRE.forEach(p=>{EN['x_'+p[0]]=p[2];TH['x_'+p[0]]=p[1]});
Object.assign(EN,{pl_add:"+ Add appliance",pl_pick:"Choose appliance...",pl_oth:"Other (enter it yourself)",pl_dt:"Details",pl_ah:"Enter a monthly budget first, then AI can explain your plan"});
Object.assign(TH,{pl_add:"+ เพิ่มเครื่องใช้",pl_pick:"เลือกเครื่องใช้...",pl_oth:"อื่น ๆ (กรอกเอง)",pl_dt:"รายละเอียด",pl_ah:"ใส่งบต่อเดือนก่อน แล้วกดให้ AI อธิบายแผนได้"});
function addPre(v){if(!v)return;const p=PRE.find(x=>x[0]==v);apps.push(p?{k:'x_'+p[0],n:'',w:p[3],h:p[4],q:p[5],p:p[6],d:p[7],open:1,fl:FL}:{n:'',w:100,h:1,q:1,p:2,d:100,open:1,fl:FL});$('psh').hidden=true;pl()}
function pl(){$('psh').innerHTML=`<option value="">${t('pl_pick')}</option>`+PRE.map(p=>`<option value="${p[0]}">${t('x_'+p[0])}</option>`).join('')+`<option value="o">${t('pl_oth')}</option>`;
$('pa').innerHTML=apps.map((a,i)=>`<div class="tip" style="background:var(--t1);margin:8px 0"><div class="row" style="margin:0"><b style="flex:1;min-width:110px">${a.k?nm(a):`<input class="n" value="${a.n}" placeholder="${t('pn')}" oninput="apps[${i}].n=this.value;plan()">`}</b>${mSel(a,i)}<select onchange="apps[${i}].p=+this.value;plan()">${[1,2,3].map(p=>`<option value="${p}" ${(a.p||2)==p?'selected':''}>${t('pl_p'+p)}</option>`).join('')}</select><input type="number" step="0.5" value="${a.h}" style="width:70px" oninput="apps[${i}].h=+this.value;plan()"><small>${t('u2')}</small><button class="g" onclick="apps[${i}].open=!apps[${i}].open;pl()">${a.open?'▲':'▼'} ${t('pl_dt')}</button></div>${a.open?`<div class="row"><input type="number" value="${a.w}" oninput="apps[${i}].w=+this.value;plan()"><small>${t('u1')}</small><input type="number" value="${a.q}" style="width:60px" oninput="apps[${i}].q=+this.value;plan()"><small>${t('u3')}</small><input type="number" value="${a.d??100}" style="width:64px" oninput="apps[${i}].d=+this.value;plan()"><small>${t('pl_d')}</small><button class="g" style="margin-left:auto" onclick="apps.splice(${i},1);pl()">${t('del')}</button></div>`:''}</div>`).join('');plan();room()}
const TR1=[[15,2.3488],[10,2.9882],[10,3.2405],[65,3.6237],[50,3.7171],[250,4.2218],[1e9,4.4217]],TR2=[[150,3.2484],[250,4.2218],[1e9,4.4217]];
function offc(u,ft){let r=u,e=0;for(const[n,p]of(u>150?TR2:TR1)){const k=Math.min(r,n);e+=k*p;r-=k;if(r<=0)break}const t=(e+(u>150?24.62:8.19)+u*ft)*1.07;return{tot:t,unit:t/u}}
function ocl(){const b=[...bills].reverse().find(x=>x.amt!=null&&x.kwh);if(b){$('ocu').value=b.kwh;$('oca').value=b.amt}occ()}
function occ(){const u=+$('ocu').value,a=+$('oca').value,mp=$('omp').value,mc=$('omc').value,c=cur(),o=$('oco');if(!(u>0)){o.innerHTML='';return}
const f=offc(u,+$('bft').value||0),H=[],P=(g,x)=>H.push(`<div class="tip" style="background:var(${g?'--t2':'--t3'})">${x}</div>`);
H.push(`<div class="tip">${t('oc_f',u,f.tot.toFixed(0),f.unit.toFixed(2),c)}</div>`);
if(a>0){const d=a-f.tot;d>f.tot*.05+1?P(0,t('oc_hi',a,d.toFixed(0),(a/u).toFixed(2),c)):P(1,t('oc_ok'))}
if(mp!==''&&mc!==''){const m=+mc-+mp;if(m>=0)u>m+.5?P(0,t('oc_mh',u,m,(u-m).toFixed(0))):P(1,t('oc_mo'))}
const et=apps.reduce((q,x)=>q+kw(x),0);if(et>0&&u>et*1.5)P(0,t('oc_eh',et.toFixed(0)));
const s=stats();if(s&&s.ak&&u>s.ak*1.4)P(0,t('oc_sh',s.ak.toFixed(0)));o.innerHTML=H.join('')}
function inv(a,ft){for(let u=.5;u<=3000;u+=.5)if(offc(u,ft).tot>=a)return u;return 3000}
function bcc(){const ft=+$('bft').value||0,c=cur(),u=+$('bu').value,a=+$('ba').value;$('bo1').textContent=u>0?t('bc_r1',u,offc(u,ft).tot.toFixed(0),c):'';$('bo2').textContent=a>0?t('bc_r2',inv(a,ft).toFixed(0),a,c):''}
function plan(){occ();bcc();plan0();hsum();$('pi').disabled=!sample||!PL;$('ph').textContent=!sample?t('o1'):!PL?t('pl_ah'):''}
function plan0(){const b=+$('pb').value,pr=+$('price').value,fee=+$('pf').value||0,lim=+$('pw').value||0,c=cur(),A=apps.filter(a=>a.w>0&&a.h>0&&a.q>0);PL=null;$('pv').textContent='';
$('pctx').textContent=`${t('pl_b')}: ${b||'-'} ${c} · ${t('pr')}: ${pr||'-'} · ${t('pl_f')}: ${fee} · ${t('pl_l')}: ${lim} W`;
if(!b||!pr||!A.length){$('po').innerHTML=`<div class="tip" style="background:var(--t3)">${t('pl_ah2')}</div>`;return}
const cap=(b-fee)/pr;if(cap<=0){$('po').innerHTML=`<div class="tip" style="background:var(--t3)">${t('pl_x')}</div>`;return}
const H=new Map(A.map(a=>[a,a.h])),want=A.reduce((s,a)=>s+pk(a,a.h),0);let need=want-cap;
if(need>0)for(const [tier,fl] of [[3,0],[2,.4]]){const T=A.filter(a=>(a.p||2)==tier),tk=T.reduce((s,a)=>s+pk(a,a.h),0);if(!tk||need<=0)continue;const cut=Math.min(need,tk*(1-fl)),sc=(tk-cut)/tk;T.forEach(a=>H.set(a,Math.floor(a.h*sc*2)/2));need=A.reduce((s,a)=>s+pk(a,H.get(a)),0)-cap}
const tot=A.reduce((s,a)=>s+pk(a,H.get(a)),0),cost=tot*pr+fee,over=Math.max(0,tot-cap),left=b-cost,cut=want>cap;
const on=A.filter(a=>H.get(a)>0),W=on.reduce((s,a)=>s+a.w*a.q,0),hi=on.filter(a=>a.w*a.q>=200).map(nm).join(', ');
PL={b,c,pr,cap,want,tot,cost,rows:A.map(a=>({n:nm(a),p:a.p||2,want:a.h,h:H.get(a),kwh:pk(a,H.get(a))}))};
const mx=Math.max(...A.map(a=>pk(a,a.h)));
$('po').innerHTML=`<div class="grid"><div class="card" style="margin:0"><div class="k">${t('pl_k1')}</div><div class="v">${cap.toFixed(0)} kWh</div></div><div class="card" style="margin:0"><div class="k">${t('pl_k2')}</div><div class="v">${tot.toFixed(0)} kWh</div></div><div class="card" style="margin:0"><div class="k">${t('pl_k3')}</div><div class="v">${cost.toFixed(0)} ${c}</div></div><div class="card" style="margin:0"><div class="k">${t('pl_k4')}</div><div class="v">${left.toFixed(0)} ${c}</div></div></div>
<div class="card"><h2>${t('pl_hd')}</h2><div class="note" style="margin:0 0 8px">${t(cut?'pl_cut':'pl_ok')}</div>${A.map(a=>{const h=H.get(a);return `<div style="display:flex;align-items:center;gap:8px;margin:8px 0;font-size:13px"><div style="width:96px;color:var(--mu)">${nm(a)||'?'}</div><div style="flex:1;background:var(--bd);border-radius:9px"><div style="width:${pk(a,h)/mx*100}%;background:${h<a.h?'var(--ac)':'var(--bl)'};height:18px;border-radius:9px"></div></div><b style="min-width:150px;text-align:right">${h<a.h?t('pl_from',a.h+'h'):''} ${h} ${t('u2')}</b></div>`}).join('')}
${over>0?`<div class="tip" style="background:var(--t3)">${t('pl_no',over.toFixed(0),(over*pr).toFixed(0)+' '+c)}</div>`:''}${lim&&W>lim?`<div class="tip" style="background:var(--t3)">${t('pl_w',W,lim,hi||'-')}</div>`:''}${A.some(a=>a.k=='a1'&&H.get(a)>0)?`<div class="tip">${t('pl_ac')}</div>`:''}<div class="note">${t('cn2')}</div></div>`;}
async function planAI(){if(!sample||!PL)return;$('pi').disabled=true;$('pv').textContent=t('th');
try{await sample(`${RULES()}\n\nThe user lives in a dorm room with a monthly budget of ${PL.b} ${PL.c} at ${PL.pr} per kWh. The system already computed this plan (do not recompute): allowed ${PL.cap.toFixed(0)} kWh, planned ${PL.tot.toFixed(0)} kWh, cost ${PL.cost.toFixed(0)}. Hours per day per appliance: ${PL.rows.map(r=>`${r.n} wants ${r.want}h -> ${r.h}h (priority ${r.p}, 1=must)`).join('; ')}. Explain the plan in 5 lines: what was cut and why, and 2-3 practical habits (e.g. timer, when to use A/C) to stay in budget.`,{modelTier:"quick",onText:({text})=>{$('pv').textContent=text}})}catch(e){$('pv').textContent=ERR(e)}$('pi').disabled=false}
const RC0={l:'#f2a285',r:'#fff6e6',f:'#ecc99a',fs:'grid',ws:''};let RC={...RC0},RT=null;
const wst=()=>RC.ws=='stripe'?[1,3,5].map(i=>pg([IP(0,i),IP(0,i+1),IP(0,i+1,WH),IP(0,i,WH)],sh(RC.l,.93))+pg([IP(i,0),IP(i+1,0),IP(i+1,0,WH),IP(i,0,WH)],sh(RC.r,.94))).join(''):'';
const PS=[['#f2a285','#fff6e6','#ecc99a'],['#9ec9e8','#eef7fc','#d8c7a5'],['#a8d5ba','#f3faf0','#cdbb94'],['#f5b5cf','#fff1f6','#ead3c0'],['#b8bcc6','#f3f4f6','#c9ccd3']];
$('dcp').innerHTML=PS.map((p,i)=>`<button class="g sm" onclick="setDc(${i})" style="background:linear-gradient(90deg,${p[0]} 50%,${p[2]} 50%);width:34px;height:26px;padding:0"></button>`).join('');
function setDc(i){RC.l=PS[i][0];RC.r=PS[i][1];RC.f=PS[i][2];$('cl').value=RC.l;$('cr').value=RC.r;$('cf').value=RC.f;room()}
const ME={vis:'friends',rk:1,det:1,pp:1};
const AF=(k,mo,h,q=1)=>{const p=PRE.find(x=>x[0]==k),m=(MDL[k]||[]).find(x=>x[0]==mo);return{k:'x_'+k,n:'',mo:mo||'',w:m?m[2]:p[3],h,q,p:2,d:m?m[3]:p[7]}};
const FD=[
{n:'Mint',e:'🐱',vis:'all',fr:1,rk:1,det:1,pp:1,pv:135,C:{l:'#bfe3f2',r:'#f0fdf4',f:'#d9c7a0',fs:'wood',ws:''},a:[AF('ac','d9',5),AF('fr','tb',24),AF('tv','xm',3),AF('lt','',6,2),AF('lp','',6),AF('fn','xm',4)],F:[{t:'bed',r:0,gx:4,gy:3},{t:'desk',r:0,gx:0,gy:4},{t:'chair',r:0,gx:1,gy:3}]},
{n:'Beam',e:'🐻',vis:'friends',fr:1,rk:1,det:1,pp:2,pv:330,C:{l:'#c4b5fd',r:'#f5f3ff',f:'#e2e8f0',fs:'tile',ws:'stripe'},a:[AF('ac','m12',9),AF('fr','sb',24),AF('tv','lg',6),AF('gm','ps',4),AF('wm','sf',1)],F:[{t:'sofa',r:0,gx:2,gy:4},{t:'tvc',r:0,gx:2,gy:0}]},
{n:'Nok',e:'🦉',vis:'none',fr:1,rk:1,det:0,pp:1,pv:170,C:RC0,a:[AF('ac','lg',6),AF('fr','tb',24),AF('tv','sg',4),AF('fn','ht',6)],F:[]},
{n:'Pim',e:'🐰',vis:'all',fr:0,rk:0,det:1,pp:1,pv:100,C:{l:'#fbcfe8',r:'#fff1f2',f:'#f1d5b0',fs:'grid',ws:''},a:[AF('ac','d9',4),AF('fr','mn',24),AF('lp','',8),AF('fn','xm',5)],F:[{t:'bed',r:0,gx:0,gy:2},{t:'ctab',r:0,gx:3,gy:3},{t:'shelf',r:1,gx:5,gy:0}]},
{n:'Tae',e:'🦊',vis:'friends',fr:0,rk:1,det:1,pp:1,pv:250,C:RC0,a:[AF('ac','sj',8),AF('fr','mn',24),AF('tv','sg',5),AF('fn','ht',8)],F:[]}];
const fkw=f=>f.a.reduce((q,a)=>q+kw(a),0),vec=l=>{const v={};l.forEach(a=>{const k=sk(a);v[k]=(v[k]||0)+(a.q||1)});return v},kT=(l,k)=>l.filter(a=>sk(a)==k),sm=l=>l.reduce((q,a)=>q+kw(a),0),lab=a=>(mdl(a)?mdl(a)[1]:t('md_u'))+` ${a.w}W·${a.h}h`;
function cosv(a,b){let d=0,x=0,y=0;for(const k in a){x+=a[k]**2;if(b[k])d+=a[k]*b[k]}for(const k in b)y+=b[k]**2;return x&&y?d/Math.sqrt(x*y):0}
let CMP=null;
function rankQ(){const mk=sm(apps.filter(a=>a.w>0&&a.h>0)),ak=stats()?.ak,mv=$('rmet').value;
const Q=[...(ME.rk&&mk?[{n:t('so_you'),e:'🙋',k:mk,pp:ME.pp,pv:ak,me:1}]:[]),...FD.filter(f=>f.rk).map(f=>({n:f.n,e:f.e,k:fkw(f),pp:f.pp,pv:f.pv}))],
V=q=>mv=='sv'?(q.pv?(q.pv-q.k)/q.pv*100:null):mv=='pp'?q.k/q.pp:q.k;Q.forEach(q=>q.v=V(q));
Q.sort((a,b)=>a.v==null?1:b.v==null?-1:mv=='sv'?b.v-a.v:a.v-b.v);const mx=Math.max(1,...Q.map(q=>Math.abs(q.v||0)));
return{Q,mv,mx}}
function mini(){const{Q,mv}=rankQ(),fv=q=>q.v==null?'-':mv=='sv'?(q.v>=0?'▼ ':'▲ ')+Math.abs(q.v).toFixed(0)+'%':q.v.toFixed(0)+' kWh';
$('mini').innerHTML=`<div style="font-weight:700;font-size:14px">🏆 ${t('so_rt')}</div><div class="note" style="margin:2px 0 8px">${t({sv:'so_m1',pp:'so_m2',kw:'so_m3'}[mv])}</div>`+(Q.length?Q.slice(0,5).map((q,i)=>`<div style="display:flex;align-items:center;gap:6px;margin:6px 0;font-size:13px;${q.me?'font-weight:700':''}"><span style="width:24px">${['🥇','🥈','🥉'][i]||'#'+(i+1)}</span><span style="flex:1">${q.e} ${q.n}</span><b>${fv(q)}</b></div>`).join(''):`<div class="note">${t('so_ph')}</div>`)+`<div class="note" style="margin-top:8px">${t('so_mo')} →</div>`}
function visit(i){const f=FD[i],S=[apps,FUR,SEL,SELF,RC,HT,NN,FL];apps=f.a.map(a=>({...a}));FUR=f.F.map(x=>({...x}));SEL=SELF=null;RC=f.C;RT=$('vroom');room();RT=null;[apps,FUR,SEL,SELF,RC,HT,NN,FL]=S;
$('vd').innerHTML=`<div class="row"><b>${f.e} ${f.n}</b></div>`+(f.det?f.a.map(a=>`<div class="note" style="margin:2px 0">${em(a)} ${nm(a)} · ${mdl(a)?mdl(a)[1]:t('md_u')} · ${a.w}W · ${a.h} ${t('u2')} · ${kw(a).toFixed(0)} kWh</div>`).join(''):`<div class="note">${t('so_nd')}</div>`);$('vw').hidden=false}
function soc(){const mine=apps.filter(a=>a.w>0&&a.h>0),mk=sm(mine);$('mvis').value=ME.vis;
const{Q,mv,mx}=rankQ();
$('rk').innerHTML=Q.map((q,i)=>`<div style="display:flex;align-items:center;gap:8px;margin:7px 0;font-size:13px;${q.me?'font-weight:700':''}"><div style="width:26px">${['🥇','🥈','🥉'][i]||'#'+(i+1)}</div><div style="width:92px">${q.e} ${q.n}</div><div style="flex:1;background:var(--bd);border-radius:9px"><div style="width:${q.v==null?0:Math.abs(q.v)/mx*100}%;background:${q.me?'var(--ac)':'var(--bl)'};height:16px;border-radius:9px"></div></div><b style="min-width:84px;text-align:right">${q.v==null?'-':mv=='sv'?(q.v>=0?'▼ ':'▲ ')+Math.abs(q.v).toFixed(0)+'%':q.v.toFixed(0)+' kWh'}</b></div>`).join('')+FD.filter(f=>!f.rk).map(f=>`<div class="note">🔒 ${f.e} ${f.n} (${t('so_hid')})</div>`).join('');
$('vl').innerHTML=FD.map((f,i)=>`<div class="tip" style="background:var(--t1);display:flex;align-items:center;gap:8px;margin:6px 0"><span style="font-size:24px">${f.e}</span><b style="flex:1">${f.n}</b>${f.vis=='all'||(f.vis=='friends'&&f.fr)?`<button class="g" onclick="visit(${i})">${t('so_go')}</button>`:`<span class="note" style="margin:0">🔒 ${t('so_cl')}</span>`}</div>`).join('');
CMP=null;let h='';
if(!mine.length)h=`<div class="note">${t('so_ph')}</div>`;else if(!ME.det)h=`<div class="note">${t('so_rc')}</div>`;
else{const C=FD.filter(f=>f.rk&&f.det).map(f=>({f,s:cosv(vec(mine),vec(f.a)),k:fkw(f)})).sort((a,b)=>b.s-a.s);
h=C.map(c=>`<div class="note" style="margin:2px 0">${c.f.e} ${c.f.n} · ${(c.s*100).toFixed(0)}% ${t('so_sim')} · ${c.k.toFixed(0)} kWh</div>`).join('')+`<div class="note"><b>${t('so_you')}: ${mk.toFixed(0)} kWh</b></div>`;
const b=C.find(c=>c.k<mk&&c.s>.5);
if(!b)h+=`<div class="tip">${t('so_none')}</div>`;
else{const f=b.f,rows=[...new Set(mine.map(sk))].filter(k=>kT(f.a,k).length).map(k=>{const m=kT(mine,k),q=kT(f.a,k);return{k,mk:sm(m),fk:sm(q),ma:m[0],fa:q[0]}}).filter(r=>r.mk-r.fk>.5).sort((a,b)=>(b.mk-b.fk)-(a.mk-a.fk)).slice(0,3);
CMP={f,rows,mk,fk:b.k};
h+=`<div class="tip"><b>${f.e} ${f.n}</b> · ${(b.s*100).toFixed(0)}% ${t('so_sim')}<br>`+rows.map(r=>`${em(r.ma)} ${t('x_'+r.k)||r.k}: ${t('so_you')} ${lab(r.ma)} → ${f.n} ${lab(r.fa)} <b class="s">(−${(r.mk-r.fk).toFixed(0)} kWh)</b>`).join('<br>')+`</div>`}}
$('co').innerHTML=h;$('cb').disabled=!sample||!CMP;$('cv').textContent=''}
async function cmpAI(){if(!sample||!CMP)return;$('cb').disabled=true;$('cv').textContent=t('th');const{rows,mk,fk}=CMP,kn=[...new Set(rows.map(r=>r.k))].map(k=>`${k}: ${(MDL[k]||[]).map(m=>`${m[1]} ${m[2]}W`).join(', ')||'-'}`).join('; ');
try{await sample(`${RULES()}\n\nThe user's room uses ${mk.toFixed(0)} kWh/month. A friend with a similar room uses ${fk.toFixed(0)} kWh/month. System-computed differences (do not recompute): ${rows.map(r=>`${r.k}: you ${lab(r.ma)} = ${r.mk.toFixed(0)} kWh; friend ${lab(r.fa)} = ${r.fk.toFixed(0)} kWh`).join('; ')}. Known models (name, watts): ${kn}. In max 6 lines: give possible reasons for each gap (model efficiency, wattage, hours) as possibilities, not facts; then recommend up to 2 models from the known list or the friend's models; then 1 habit. Never invent brands or specs.`,{modelTier:"quick",onText:({text})=>{$('cv').textContent=text}})}catch(e){$('cv').textContent=ERR(e)}$('cb').disabled=false}
let TC=null,TM='auto';
const P=(h,s,l)=>`hsl(${(Math.round(h)+360)%360} ${Math.round(s)}% ${l}%)`;
function hueOf(x){const n=parseInt(x.slice(1),16),r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255,M=Math.max(r,g,b),m=Math.min(r,g,b),d=M-m;let h=0;if(d){h=M==r?((g-b)/d)%6:M==g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360}const l=(M+m)/2;return[h,d?d/(1-Math.abs(2*l-1))*100:0]}
const isDark=()=>TM=='dark'||(TM=='auto'&&matchMedia('(prefers-color-scheme:dark)').matches);
function theme(x){const st=document.documentElement.style;TC=x;$('pick').value=x||'#b8a9e8';
['--bg','--card','--tx','--mu','--bd','--field','--ac','--bl','--gr','--pr','--prt','--prh','--t1','--t2','--t3','--t4','--sh'].forEach(k=>st.removeProperty(k));
document.querySelectorAll('button.sw').forEach(b=>b.style.outline=b.dataset.c==x?'2px solid var(--prt)':'');
if(x){let[h,s]=hueOf(x);s=s<8?6:Math.min(70,Math.max(30,s));const d=isDark(),V=d?{'--bg':P(h,25,12),'--card':P(h,22,17),'--tx':P(h,30,93),'--mu':P(h,12,66),'--bd':P(h,20,26),'--field':P(h,25,14),'--ac':P(h+150,55,68),'--bl':P(h,50,62),'--gr':'hsl(150 45% 60%)','--pr':P(h,35,30),'--prt':P(h,80,93),'--prh':P(h,35,36),'--t1':P(h,25,21),'--t2':P(h+120,22,20),'--t3':P(h+200,22,21),'--t4':P(h+45,25,21),'--sh':'none'}:{'--bg':P(h,s*.6,98),'--card':'#fff','--tx':P(h,20,24),'--mu':P(h,10,55),'--bd':P(h,s*.7,93),'--field':P(h,s,99),'--ac':P(h+150,65,82),'--bl':P(h,s+10,79),'--gr':'hsl(150 45% 33%)','--pr':P(h,s,91),'--prt':P(h,s*.8+10,30),'--prh':P(h,s,85),'--t1':P(h,s,95),'--t2':P(h+120,s*.8,94),'--t3':P(h+200,s*.8,94),'--t4':P(h+45,s*.8,94),'--sh':`0 4px 18px hsl(${Math.round(h)} ${Math.round(s)}% 50% / .09)`};Object.entries(V).forEach(([k,v])=>st.setProperty(k,v))}
try{localStorage.setItem('thm',JSON.stringify({c:x,m:TM}))}catch(e){}}
function mode(m){TM=m;m=='auto'?document.documentElement.removeAttribute('data-theme'):document.documentElement.setAttribute('data-theme',m);document.querySelectorAll('[data-m]').forEach(b=>b.classList.toggle('on2',b.dataset.m==m));theme(TC)}
['#b8a9e8','#f4b6c8','#f5bfa5','#f3dd8f','#a8dfc4','#8fd3d0','#a9c9f0','#c4c4d0'].forEach(c=>{const b=document.createElement('button');b.className='sw';b.dataset.c=c;b.style.background=c;b.setAttribute('aria-label',c);b.onclick=()=>theme(c);$('sws').append(b)});
$('pick').oninput=e=>theme(e.target.value);$('trs').onclick=()=>theme(null);
document.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>mode(b.dataset.m));
matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>theme(TC));
ui();demo();
try{const q=JSON.parse(localStorage.getItem('thm')||'null');if(q){TC=q.c;mode(q.m||'auto')}else mode('auto')}catch(e){mode('auto')}
