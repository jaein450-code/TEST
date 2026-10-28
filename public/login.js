const $ = s => document.querySelector(s);
let selectedEmail = '';
async function api(path, data) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json(); if (!response.ok) throw new Error(result.message); return result;
}
$('#email-form').onsubmit = async e => {
  e.preventDefault(); const button = $('#send-code'); button.disabled = true;
  $('#auth-message').textContent = '인증번호를 발송하고 있습니다…';
  try {
    const email = $('#email').value.trim();
    await api('/api/auth/request', { email }); selectedEmail = email;
    $('#auth-message').textContent = `${email}로 인증번호를 보냈습니다. 별도 발신 주소로 전송되므로 스팸함도 확인해 주세요. 10분 이내에 입력해 주세요.`; $('#code-form').hidden = false; $('#email').readOnly = true; $('#code').focus();
    let remaining = 60; button.textContent = `${remaining}초 후 재발송`;
    const timer = setInterval(() => { remaining--; button.textContent = `${remaining}초 후 재발송`; if (!remaining) { clearInterval(timer); button.disabled = false; button.textContent = '인증번호 다시 받기'; } }, 1000);
  } catch (error) { $('#auth-message').textContent = error.message; button.disabled = false; }
};
$('#code-form').onsubmit = async e => {
  e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
  try { await api('/api/auth/verify', { email: selectedEmail, code: $('#code').value.trim() }); location.assign('/'); }
  catch (error) { $('#auth-message').textContent = error.message; } finally { button.disabled = false; }
};
$('#change-email').onclick = () => { $('#email').readOnly = false; $('#code-form').hidden = true; $('#code').value = ''; $('#email').focus(); };
if (location.protocol === 'file:') {
  $('#auth-message').textContent = '직원 인증에는 실행 중인 서버가 필요합니다. 이 파일은 로그인 화면 미리보기입니다.'; $('#send-code').disabled = true;
} else {
  fetch('/api/auth/config').then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(config => {
    if (config.development) $('#auth-message').textContent = '개발 모드: 실제 메일은 발송되지 않습니다. 인증번호는 서버의 로컬 개발 메일 파일에서 확인합니다.';
  }).catch(() => { $('#auth-message').textContent = '인증 서버에 연결할 수 없습니다. npm start로 실행한 서버에서 접속해 주세요.'; $('#send-code').disabled = true; });
}
