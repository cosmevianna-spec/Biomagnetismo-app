import { supabase } from './supabase-client.js';

const PARES_PUBLIC_SELECT =
  'id, numero, ponto_a, ponto_b, type, categoria, origem';

const PARES_ADMIN_SELECT =
  'id, numero, ponto_a, ponto_b, type, categoria, descricao, observacao, origem, ativo, created_at, updated_at';

/**
 * Converte um registro do banco para o formato compativel com a V4 local.
 * @param {object} row
 * @returns {{ id: string, n: number|null, a: string, b: string, type: string, origem: string }}
 */
export function mapDbRow(row) {
  return {
    id: row.id,
    n: row.numero,
    a: row.ponto_a,
    b: row.ponto_b,
    type: row.type,
    origem: row.origem,
  };
}

/**
 * Converte um registro do banco para o formato da administracao.
 * @param {object} row
 */
export function mapAdminRow(row) {
  return {
    id: row.id,
    numero: row.numero,
    ponto_a: row.ponto_a,
    ponto_b: row.ponto_b,
    type: row.type,
    categoria: row.categoria,
    descricao: row.descricao,
    observacao: row.observacao,
    origem: row.origem,
    ativo: row.ativo,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function throwIfError(error, fallback) {
  if (error) {
    throw new Error(error.message || fallback);
  }
}

function requirePontos(pontoA, pontoB) {
  const a = String(pontoA || '').trim();
  const b = String(pontoB || '').trim();
  if (!a || !b) {
    throw new Error('Ponto A e Ponto B são obrigatórios.');
  }
  return { a, b };
}

function optionalText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Usando a base local neste dispositivo.');
  }
  return supabase;
}

/**
 * Busca pares biomagneticos ativos no Supabase, ordenados por numero.
 * @returns {Promise<object[]>} linhas brutas do banco
 */
export async function fetchActivePares() {
  const { data, error } = await requireSupabase()
    .from('pares_biomagneticos')
    .select(PARES_PUBLIC_SELECT)
    .eq('ativo', true)
    .order('numero', { ascending: true, nullsFirst: false });

  throwIfError(error, 'Erro ao buscar pares no Supabase.');
  return data ?? [];
}

/**
 * Busca pares ativos ja mapeados para o formato V4.
 * @returns {Promise<Array<{ id, n, a, b, type, origem }>>}
 */
export async function fetchActiveParesMapped() {
  const rows = await fetchActivePares();
  return rows.map(mapDbRow);
}

/**
 * Tenta carregar pares do Supabase; em falha, usa a base local (ex.: DATA.pairs).
 *
 * @param {object[]} localPairs - fallback local, tipicamente DATA.pairs
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ source: 'remote'|'local', pairs: object[], error?: Error }>}
 */
export async function fetchParesWithFallback(localPairs, options = {}) {
  const { timeoutMs = 5000 } = options;

  try {
    const fetchPromise = fetchActiveParesMapped();
    const rows =
      timeoutMs > 0
        ? await Promise.race([
            fetchPromise,
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error(`Timeout ao buscar pares (${timeoutMs}ms).`)),
                timeoutMs
              )
            ),
          ])
        : await fetchPromise;

    return { source: 'remote', pairs: rows };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return {
      source: 'local',
      pairs: Array.isArray(localPairs) ? localPairs.slice() : [],
      error,
    };
  }
}

/**
 * Lista todos os pares para administracao (ativos e desativados).
 * Requer usuario autenticado para ver registros com ativo=false.
 */
export async function fetchAdminPares() {
  const { data, error } = await requireSupabase()
    .from('pares_biomagneticos')
    .select(PARES_ADMIN_SELECT)
    .order('numero', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  throwIfError(error, 'Erro ao listar Pares Biomagnéticos.');
  return (data ?? []).map(mapAdminRow);
}

/**
 * Cria um Par Biomagnético de origem USUARIO.
 */
export async function createParUsuario(fields) {
  const { a, b } = requirePontos(fields.ponto_a, fields.ponto_b);
  const categoria = optionalText(fields.categoria);

  const { data, error } = await requireSupabase()
    .from('pares_biomagneticos')
    .insert({
      ponto_a: a,
      ponto_b: b,
      type: categoria || 'Par Biomagnético',
      categoria,
      descricao: optionalText(fields.descricao),
      observacao: optionalText(fields.observacao),
      origem: 'USUARIO',
      numero: null,
      ativo: true,
    })
    .select(PARES_ADMIN_SELECT)
    .single();

  throwIfError(error, 'Erro ao criar Par Biomagnético.');
  return mapAdminRow(data);
}

/**
 * Atualiza campos editaveis de um Par Biomagnético.
 * Nao envia origem nem numero.
 */
export async function updatePar(id, fields, options = {}) {
  if (!id) {
    throw new Error('Par Biomagnético inválido.');
  }

  const { a, b } = requirePontos(fields.ponto_a, fields.ponto_b);
  const categoria = optionalText(fields.categoria);
  const payload = {
    ponto_a: a,
    ponto_b: b,
    categoria,
    descricao: optionalText(fields.descricao),
    observacao: optionalText(fields.observacao),
  };

  if (options.origem === 'USUARIO') {
    payload.type = categoria || 'Par Biomagnético';
  }

  const { data, error } = await requireSupabase()
    .from('pares_biomagneticos')
    .update(payload)
    .eq('id', id)
    .select(PARES_ADMIN_SELECT)
    .single();

  throwIfError(error, 'Erro ao salvar Par Biomagnético.');
  return mapAdminRow(data);
}

/**
 * Desativa ou reativa um Par Biomagnético (soft delete).
 */
export async function setParAtivo(id, ativo) {
  if (!id) {
    throw new Error('Par Biomagnético inválido.');
  }

  const { data, error } = await requireSupabase()
    .from('pares_biomagneticos')
    .update({ ativo: Boolean(ativo) })
    .eq('id', id)
    .select(PARES_ADMIN_SELECT)
    .single();

  throwIfError(error, 'Erro ao atualizar o status do Par Biomagnético.');
  return mapAdminRow(data);
}
