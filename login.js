const $ = id => document.getElementById(id);
let accountEnabled = false, accountMode = 'login', accountBusy = false;
function selectAccountMode(mode) {
  if (accountBusy) return;
  accountMode = mode;
  const registering = mode === 'register';
  $('authTitle').textContent = registering ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
  $('authIntro').textContent = registering ? 'สมัครครั้งเดียว แล้วใช้บัญชีเดิมเข้าสู่ระบบได้' : 'ใช้บัญชีเดิมกลับมาวิเคราะห์ค่าไฟได้ทุกครั้ง';
  $('authSubmit').textContent = registering ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
  $('nameField').hidden = $('confirmField').hidden = !registering;
  $('authName').required = $('authConfirm').required = registering;
  $('authPassword').autocomplete = registering ? 'new-password' : 'current-password';
  $('authPassword').minLength = registering ? 8 : 1;
  $('authPassword').maxLength = registering ? 128 : 4096;
  $('authPassword').placeholder = registering ? 'อย่างน้อย 8 ตัวอักษร' : 'รหัสผ่านของคุณ';
  $('authPassword').value = $('authConfirm').value = '';
  for (const id of ['login', 'register']) {
    const active = mode === id;
    $(id + 'Tab').className = active ? '' : 'g';
    $(id + 'Tab').setAttribute('aria-pressed', String(active));
  }
  if (accountEnabled) $('authMessage').textContent = '';
}
$('loginTab').onclick = () => selectAccountMode('login');
$('registerTab').onclick = () => selectAccountMode('register');
$('authForm').onsubmit = async event => {
  event.preventDefault();
  if (accountBusy || !accountEnabled || !$('authForm').reportValidity()) return;
  const registering = accountMode === 'register';
  if (registering && $('authPassword').value !== $('authConfirm').value) {
    $('authMessage').textContent = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'; return;
  }
  const payload = { action: registering ? 'auth.register' : 'auth.login',
    email: $('authEmail').value.trim(), password: $('authPassword').value,
    ...(registering ? { name: $('authName').value.trim() } : {}) };
  $('authPassword').value = $('authConfirm').value = '';
  accountBusy = true; $('authSubmit').disabled = true;
  $('authMessage').textContent = registering ? 'กำลังสมัครสมาชิก...' : 'กำลังเข้าสู่ระบบ...';
  try {
    const result = await window.StreamlitBridge.request(payload);
    if (result.user) { $('authMessage').textContent = 'สำเร็จ กำลังเปิดหน้าเว็บ...'; window.ElectricityPages.open('index.html'); }
    if (!result.user) {
      accountBusy = false; selectAccountMode('login'); $('authMessage').textContent = result.message || '';
    }
  } catch (error) { $('authMessage').textContent = error.message; }
  finally { payload.password = ''; accountBusy = false; $('authSubmit').disabled = !accountEnabled; }
};

(async () => {
  try {
    const config = await window.StreamlitBridge.ready;
    const auth = config.auth;
    accountEnabled = !!auth?.enabled;
    $('authSubmit').disabled = !accountEnabled;
    $('authMessage').textContent = auth?.message || (typeof auth?.enabled !== 'boolean'
      ? 'ไฟล์ app.py และหน้า Login เป็นคนละเวอร์ชัน กรุณาอัปเดตไฟล์จาก ZIP ชุดเดียวกัน แล้ว Reboot app'
      : !accountEnabled ? 'กรุณาตั้งค่า FIREBASE_API_KEY ใน Secrets ก่อนใช้งานบัญชี' : '');
    if (auth?.user) window.ElectricityPages.open('index.html');
  } catch (error) { $('authMessage').textContent = error.message; }
})();
