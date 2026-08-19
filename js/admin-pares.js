import {
  createParUsuario,
  fetchAdminPares,
  setParAtivo,
  updatePar,
} from './pares-service.js';

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

let allPares = [];
let editingId = null;
let editingOrigem = 'USUARIO';
let onParesChanged = null;

function setError(message) {
  const el = $('adminParError');
  if (el) el.textContent = message || '';
}

function openEditor(title) {
  const modal = $('adminParModal');
  const heading = $('adminParTitle');
  if (heading) heading.textContent = title;
  setError('');
  if (modal) modal.classList.add('open');
  $('adminPontoA')?.focus();
}

function closeEditor() {
  const modal = $('adminParModal');
  if (modal) modal.classList.remove('open');
  editingId = null;
  editingOrigem = 'USUARIO';
}

function fillForm(par) {
  $('adminPontoA').value = par?.ponto_a || '';
  $('adminPontoB').value = par?.ponto_b || '';
  $('adminCategoria').value = par?.categoria || '';
  $('adminDescricao').value = par?.descricao || '';
  $('adminObservacao').value = par?.observacao || '';
  $('adminOrigemInfo').textContent = par
    ? `Origem: ${par.origem}${par.numero != null ? ' · Nº ' + par.numero : ''}`
    : 'Origem: USUARIO · número vazio';
}

function currentFilter() {
  return $('adminFiltro')?.value || 'todos';
}

function currentQuery() {
  return norm($('adminBusca')?.value || '').trim();
}

function filteredPares() {
  const filtro = currentFilter();
  const q = currentQuery();
  return allPares.filter((par) => {
    if (filtro === 'ativos' && !par.ativo) return false;
    if (filtro === 'desativados' && par.ativo) return false;
    if (!q) return true;
    const hay = [
      par.numero,
      par.ponto_a,
      par.ponto_b,
      par.categoria,
      par.descricao,
      par.observacao,
      par.type,
      par.origem,
    ]
      .map((v) => norm(v))
      .join(' ');
    return hay.includes(q);
  });
}

function renderList() {
  const list = $('adminParesList');
  const summary = $('adminParesSummary');
  if (!list) return;

  const rows = filteredPares();
  const ativos = allPares.filter((p) => p.ativo).length;
  const base = allPares.filter((p) => p.origem === 'BASE_V4').length;
  const usuario = allPares.filter((p) => p.origem === 'USUARIO').length;

  if (summary) {
    summary.textContent = `${allPares.length} pares · ${ativos} ativos · ${base} BASE_V4 · ${usuario} USUARIO`;
  }

  if (!rows.length) {
    list.innerHTML = '<div class="small">Nenhum Par Biomagnético encontrado.</div>';
    return;
  }

  list.innerHTML = rows
    .map((par) => {
      const num = par.numero != null ? `#${par.numero}` : 'sem nº';
      const status = par.ativo ? 'Ativo' : 'Desativado';
      const action = par.ativo ? 'Desativar' : 'Reativar';
      const actionClass = par.ativo ? 'red' : 'green';
      return `<div class="result ${par.ativo ? '' : 'status-off'}">
        <b>${escapeHtml(num)} — ${escapeHtml(par.ponto_a)} ↔ ${escapeHtml(par.ponto_b)}</b>
        <span class="small">${escapeHtml(par.categoria || par.type || '')}</span>
        <div class="row" style="margin-top:8px">
          <span class="badge ${par.origem === 'BASE_V4' ? 'origin-base' : 'origin-user'}">${escapeHtml(par.origem)}</span>
          <span class="badge">${status}</span>
        </div>
        <div class="row">
          <button type="button" class="secondary" data-edit="${escapeHtml(par.id)}">Editar</button>
          <button type="button" class="${actionClass}" data-toggle="${escapeHtml(par.id)}" data-ativo="${par.ativo ? '1' : '0'}">${action}</button>
        </div>
      </div>`;
    })
    .join('');
}

async function loadPares() {
  const list = $('adminParesList');
  if (list) list.innerHTML = '<div class="small">Carregando Pares Biomagnéticos…</div>';
  try {
    allPares = await fetchAdminPares();
    renderList();
  } catch (err) {
    allPares = [];
    if (list) {
      list.innerHTML = `<div class="small">${escapeHtml(err.message || 'Erro ao carregar pares.')}</div>`;
    }
  }
}

function openCreate() {
  editingId = null;
  editingOrigem = 'USUARIO';
  fillForm(null);
  openEditor('Novo Par Biomagnético');
}

function openEdit(id) {
  const par = allPares.find((item) => item.id === id);
  if (!par) return;
  editingId = par.id;
  editingOrigem = par.origem;
  fillForm(par);
  openEditor('Editar Par Biomagnético');
}

async function savePar() {
  const saveBtn = $('adminParSave');
  setError('');
  const fields = {
    ponto_a: $('adminPontoA')?.value,
    ponto_b: $('adminPontoB')?.value,
    categoria: $('adminCategoria')?.value,
    descricao: $('adminDescricao')?.value,
    observacao: $('adminObservacao')?.value,
  };

  if (saveBtn) saveBtn.disabled = true;
  try {
    if (editingId) {
      await updatePar(editingId, fields, { origem: editingOrigem });
    } else {
      await createParUsuario(fields);
    }
    closeEditor();
    await loadPares();
    if (onParesChanged) await onParesChanged();
  } catch (err) {
    setError(err.message || 'Não foi possível salvar o Par Biomagnético.');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function toggleAtivo(id, currentlyActive) {
  const next = currentlyActive !== '1';
  const label = next ? 'reativar' : 'desativar';
  if (!confirm(`Confirma ${label} este Par Biomagnético?`)) return;
  try {
    await setParAtivo(id, next);
    await loadPares();
    if (onParesChanged) await onParesChanged();
  } catch (err) {
    alert(err.message || 'Não foi possível atualizar o Par Biomagnético.');
  }
}

function setAdminVisible(visible) {
  const card = $('adminParesCard');
  const btn = $('adminParesBtn');
  if (card) card.hidden = !visible;
  if (btn) btn.hidden = !visible;
  if (!visible) {
    closeEditor();
    allPares = [];
    const list = $('adminParesList');
    if (list) list.innerHTML = '';
    return;
  }
  loadPares();
}

export function initAdminPares(options = {}) {
  onParesChanged = options.onParesChanged || null;
  const card = $('adminParesCard');
  if (!card) return;

  $('adminParesBtn')?.addEventListener('click', () => {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('adminNovoPar')?.addEventListener('click', openCreate);
  $('adminParCancel')?.addEventListener('click', closeEditor);
  $('adminParSave')?.addEventListener('click', savePar);
  $('adminBusca')?.addEventListener('input', renderList);
  $('adminFiltro')?.addEventListener('change', renderList);

  $('adminParModal')?.addEventListener('click', (event) => {
    if (event.target.id === 'adminParModal') closeEditor();
  });

  $('adminParesList')?.addEventListener('click', (event) => {
    const editBtn = event.target.closest('[data-edit]');
    if (editBtn) {
      openEdit(editBtn.getAttribute('data-edit'));
      return;
    }
    const toggleBtn = event.target.closest('[data-toggle]');
    if (toggleBtn) {
      toggleAtivo(
        toggleBtn.getAttribute('data-toggle'),
        toggleBtn.getAttribute('data-ativo')
      );
    }
  });
}

export function onAuthSession(session) {
  setAdminVisible(Boolean(session));
}
