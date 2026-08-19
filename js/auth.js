import { supabase, recoveryFromUrl } from './supabase-client.js';

const VIEWS = {
  login: 'authViewLogin',
  forgot: 'authViewForgot',
  reset: 'authViewReset',
};

function $(id) {
  return document.getElementById(id);
}

function recoveryRedirectUrl() {
  const path = window.location.pathname || '/';
  return `${window.location.origin}${path}`;
}

function clearAuthFeedback() {
  const errorEl = $('authError');
  const messageEl = $('authMessage');
  if (errorEl) errorEl.textContent = '';
  if (messageEl) messageEl.textContent = '';
}

function setAuthError(message) {
  const errorEl = $('authError');
  const messageEl = $('authMessage');
  if (messageEl) messageEl.textContent = '';
  if (errorEl) errorEl.textContent = message || '';
}

function setAuthMessage(message) {
  const errorEl = $('authError');
  const messageEl = $('authMessage');
  if (errorEl) errorEl.textContent = '';
  if (messageEl) messageEl.textContent = message || '';
}

function showAuthView(view) {
  Object.values(VIEWS).forEach((id) => {
    const el = $(id);
    if (el) el.hidden = id !== VIEWS[view];
  });
}

function setSessionUi(session) {
  const button = $('authButton');
  const adminBtn = $('adminParesBtn');
  if (button) {
    button.textContent = session ? 'Sair' : 'Entrar';
  }
  if (adminBtn) {
    adminBtn.hidden = !session;
  }
}

function openModal(view = 'login') {
  const modal = $('authModal');
  clearAuthFeedback();
  showAuthView(view);
  if (modal) modal.classList.add('open');

  if (view === 'login') {
    $('authEmail')?.focus();
  } else if (view === 'forgot') {
    $('authForgotEmail')?.focus();
  } else if (view === 'reset') {
    $('authNewPassword')?.focus();
  }
}

function closeModal() {
  const modal = $('authModal');
  if (modal) modal.classList.remove('open');
  showAuthView('login');
  clearAuthFeedback();
  if ($('authPassword')) $('authPassword').value = '';
  if ($('authNewPassword')) $('authNewPassword').value = '';
  if ($('authNewPasswordConfirm')) $('authNewPasswordConfirm').value = '';
}

function isRecoveryRedirect() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  return (
    recoveryFromUrl ||
    hash.get('type') === 'recovery' ||
    query.get('type') === 'recovery' ||
    query.get('reset') === '1'
  );
}

function clearRecoveryUrl() {
  if (!window.history || !window.history.replaceState) return;
  const url = new URL(window.location.href);
  url.searchParams.delete('reset');
  url.searchParams.delete('code');
  url.hash = '';
  const next = `${url.pathname}${url.search}`;
  window.history.replaceState({}, document.title, next || '/');
}

async function login() {
  const email = ($('authEmail')?.value || '').trim();
  const password = $('authPassword')?.value || '';
  const loginBtn = $('authLogin');

  clearAuthFeedback();

  if (!supabase) {
    setAuthError('O rastreio funciona neste dispositivo. O login precisa da conexão configurada.');
    return;
  }

  if (!email || !password) {
    setAuthError('Informe e-mail e senha.');
    return;
  }

  if (loginBtn) loginBtn.disabled = true;
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthError('E-mail ou senha inválidos.');
      return;
    }
    closeModal();
  } finally {
    if (loginBtn) loginBtn.disabled = false;
  }
}

function openForgotView() {
  const email = ($('authEmail')?.value || '').trim();
  if ($('authForgotEmail') && !$('authForgotEmail').value) {
    $('authForgotEmail').value = email;
  }
  clearAuthFeedback();
  showAuthView('forgot');
  $('authForgotEmail')?.focus();
}

async function sendRecoveryEmail() {
  const email = ($('authForgotEmail')?.value || '').trim();
  const sendBtn = $('authForgotSend');

  clearAuthFeedback();

  if (!email) {
    setAuthError('Informe o e-mail da conta.');
    return;
  }

  if (sendBtn) sendBtn.disabled = true;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: recoveryRedirectUrl(),
    });

    if (error && !/user not found|unable to validate email/i.test(error.message || '')) {
      setAuthError('Não foi possível enviar o e-mail de recuperação. Tente novamente.');
      return;
    }

    setAuthMessage(
      'Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.'
    );
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

function openResetView() {
  if ($('authNewPassword')) $('authNewPassword').value = '';
  if ($('authNewPasswordConfirm')) $('authNewPasswordConfirm').value = '';
  openModal('reset');
}

async function saveNewPassword() {
  const password = $('authNewPassword')?.value || '';
  const confirm = $('authNewPasswordConfirm')?.value || '';
  const saveBtn = $('authSavePassword');

  clearAuthFeedback();

  if (!password || !confirm) {
    setAuthError('Informe e confirme a nova senha.');
    return;
  }
  if (password.length < 6) {
    setAuthError('A nova senha deve ter pelo menos 6 caracteres.');
    return;
  }
  if (password !== confirm) {
    setAuthError('As senhas não coincidem.');
    return;
  }

  if (saveBtn) saveBtn.disabled = true;
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setAuthError('Não foi possível salvar a nova senha. Solicite um novo link.');
      return;
    }
    clearRecoveryUrl();
    setAuthMessage('Senha atualizada.');
    closeModal();
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function toggleAuth() {
  if (!supabase) {
    setAuthError('O rastreio funciona neste dispositivo. O login precisa da conexão configurada.');
    openModal('login');
    return;
  }
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    await supabase.auth.signOut();
    closeModal();
    return;
  }
  openModal('login');
}

/**
 * Inicializa login/logout, recuperacao de senha e sessao persistente.
 * Nao ha cadastro publico.
 * @param {(session: object|null) => void} [onChange]
 */
export async function initAuth(onChange) {
  const button = $('authButton');
  const modal = $('authModal');
  if (!button || !modal) return;

  button.addEventListener('click', () => {
    toggleAuth();
  });

  $('authCancel')?.addEventListener('click', closeModal);
  $('authLogin')?.addEventListener('click', login);
  $('authForgotLink')?.addEventListener('click', openForgotView);
  $('authForgotSend')?.addEventListener('click', sendRecoveryEmail);
  $('authForgotBack')?.addEventListener('click', () => {
    clearAuthFeedback();
    showAuthView('login');
    $('authEmail')?.focus();
  });
  $('authSavePassword')?.addEventListener('click', saveNewPassword);
  $('authResetCancel')?.addEventListener('click', closeModal);

  modal.addEventListener('click', (event) => {
    if (event.target === modal && $('authViewReset')?.hidden) {
      closeModal();
    }
  });

  $('authPassword')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') login();
  });
  $('authEmail')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') login();
  });
  $('authForgotEmail')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') sendRecoveryEmail();
  });
  $('authNewPasswordConfirm')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') saveNewPassword();
  });

  if (!supabase) {
    setSessionUi(null);
    if (onChange) onChange(null);
    return;
  }

  supabase.auth.onAuthStateChange((event, session) => {
    setSessionUi(session);
    if (event === 'PASSWORD_RECOVERY') {
      openResetView();
    }
    if (onChange) onChange(session);
  });

  const { data } = await supabase.auth.getSession();
  setSessionUi(data.session);
  if (onChange) onChange(data.session);

  if (isRecoveryRedirect()) {
    openResetView();
  }
}

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}
