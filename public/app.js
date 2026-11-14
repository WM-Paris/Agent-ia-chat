/* =====================================================================
   Agent IA — chat multi-fournisseurs (100 % côté navigateur)
   La clé API de l'utilisateur est stockée uniquement dans son navigateur
   et envoyée directement à son fournisseur LLM.
   ===================================================================== */
'use strict';

/* ---------- 1. Fournisseurs pris en charge ---------- */
// type "openai"    : API compatible OpenAI (/chat/completions, /models)
// type "anthropic" : API native Claude (/messages)
const PROVIDERS = {
  groq: {
    label: 'Groq', type: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    keyUrl: 'https://console.groq.com/keys', keyHint: 'gsk_…',
  },
  openai: {
    label: 'OpenAI (ChatGPT)', type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys', keyHint: 'sk-…',
  },
  mistral: {
    label: 'Mistral AI', type: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    keyUrl: 'https://console.mistral.ai/api-keys', keyHint: 'Votre clé Mistral',
  },
  gemini: {
    label: 'Google Gemini', type: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey', keyHint: 'AIza…',
  },
  anthropic: {
    label: 'Anthropic (Claude)', type: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-5-5',
    keyUrl: 'https://console.anthropic.com/settings/keys', keyHint: 'sk-ant-…',
  },
  openrouter: {
    label: 'OpenRouter (des centaines de modèles)', type: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openrouter/auto',
    keyUrl: 'https://openrouter.ai/keys', keyHint: 'sk-or-…',
  },
  deepseek: {
    label: 'DeepSeek', type: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys', keyHint: 'sk-…',
  },
  together: {
    label: 'Together AI', type: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    keyUrl: 'https://api.together.ai/settings/api-keys', keyHint: 'Votre clé Together',
  },
  custom: {
    label: 'Autre (API compatible OpenAI, Ollama…)', type: 'openai',
    baseUrl: '', defaultModel: '', custom: true, keyOptional: true,
    keyUrl: '', keyHint: 'Facultatif pour un serveur local',
  },
};

const DEFAULT_SYSTEM_PROMPT =
  'Tu es un assistant utile, précis et bienveillant. Réponds en français sauf si on te parle dans une autre langue. Utilise le Markdown pour structurer tes réponses quand c\'est utile.';

/* ---------- 2. Stockage local ---------- */
const STORE_SETTINGS = 'agentia.settings';
const STORE_KEY = 'agentia.apiKey';
const STORE_HISTORY = 'agentia.history';

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STORE_SETTINGS)) || {}; } catch { s = {}; }
  s.apiKey = localStorage.getItem(STORE_KEY) || sessionStorage.getItem(STORE_KEY) || '';
  return s;
}
function saveSettings(s) {
  const { apiKey, ...rest } = s;
  localStorage.setItem(STORE_SETTINGS, JSON.stringify(rest));
  localStorage.removeItem(STORE_KEY);
  sessionStorage.removeItem(STORE_KEY);
  if (apiKey) (s.remember ? localStorage : sessionStorage).setItem(STORE_KEY, apiKey);
}
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(STORE_HISTORY)) || []; } catch { return []; }
}
function saveHistory() {
  localStorage.setItem(STORE_HISTORY, JSON.stringify(state.messages));
}

/* ---------- 3. État ---------- */
const state = {
  settings: loadSettings(),
  messages: loadHistory(),   // [{ role: 'user' | 'assistant', content: '...' }]
  models: [],
  controller: null,          // AbortController de la génération en cours
};

/* ---------- 4. Raccourcis DOM ---------- */
const $ = (id) => document.getElementById(id);
const el = {
  messages: $('messages'), empty: $('emptyState'), input: $('input'), form: $('chatForm'),
  send: $('sendBtn'), stop: $('stopBtn'), modelSelect: $('modelSelect'), badge: $('providerBadge'),
  overlay: $('setupOverlay'), setupForm: $('setupForm'), setupTitle: $('setupTitle'),
  providerSelect: $('providerSelect'), baseUrlField: $('baseUrlField'), baseUrl: $('baseUrlInput'),
  apiKey: $('apiKeyInput'), toggleKey: $('toggleKey'), keyLink: $('keyLink'),
  remember: $('rememberInput'), systemPrompt: $('systemPromptInput'), temperature: $('temperatureInput'),
  setupError: $('setupError'), cancelSetup: $('cancelSetup'), connect: $('connectBtn'),
};

/* ---------- 5. Appels aux API des fournisseurs ---------- */
function providerOf(s) { return PROVIDERS[s.provider] || PROVIDERS.groq; }
function baseUrlOf(s) {
  const p = providerOf(s);
  return (p.custom ? (s.baseUrl || '') : p.baseUrl).replace(/\/+$/, '');
}
function headersFor(s) {
  const p = providerOf(s);
  if (p.type === 'anthropic') {
    return {
      'Content-Type': 'application/json',
      'x-api-key': s.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }
  const h = { 'Content-Type': 'application/json' };
  if (s.apiKey) h.Authorization = 'Bearer ' + s.apiKey;
  if (s.provider === 'openrouter') h['X-Title'] = 'Agent IA';
  return h;
}

class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function apiFetch(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(
      'Impossible de joindre le fournisseur (réseau coupé, URL incorrecte, ou fournisseur qui bloque les appels depuis un navigateur — CORS).', 0);
  }
  if (!res.ok) {
    let detail = '';
    try {
      const txt = await res.text();
      try {
        const j = JSON.parse(txt);
        detail = j.error?.message || j.message || j.detail || (typeof j.error === 'string' ? j.error : '') || txt;
      } catch { detail = txt; }
    } catch { /* ignore */ }
    const prefix = {
      400: 'Requête refusée', 401: 'Clé API invalide ou manquante', 403: 'Accès refusé',
      404: 'Modèle ou adresse introuvable', 429: 'Limite de requêtes / quota atteint',
    }[res.status] || `Erreur ${res.status}`;
    throw new ApiError(`${prefix}${detail ? ' : ' + String(detail).slice(0, 400) : ''}`, res.status);
  }
  return res;
}

const NON_CHAT = /whisper|tts|embed|dall-e|moderation|audio|transcri|image|guard|rerank|realtime|search|babbage|davinci/i;

async function listModels(s) {
  const p = providerOf(s);
  const url = baseUrlOf(s) + (p.type === 'anthropic' ? '/models?limit=100' : '/models');
  const res = await apiFetch(url, { headers: headersFor(s) });
  const json = await res.json();
  const arr = Array.isArray(json) ? json : (json.data || json.models || []);
  let ids = arr.map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
  if (s.provider === 'gemini') ids = ids.map((id) => id.replace(/^models\//, ''));
  ids = ids.filter((id) => !NON_CHAT.test(id));
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

// Lit un flux SSE (Server-Sent Events) et renvoie chaque ligne "data: …"
async function* readSSE(res, signal) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('data:')) yield line.slice(5).trim();
      }
    }
    if (buffer.startsWith('data:')) yield buffer.slice(5).trim();
  } finally {
    reader.releaseLock?.();
  }
}

async function* streamChat(s, history, signal) {
  const p = providerOf(s);
  const system = (s.systemPrompt ?? DEFAULT_SYSTEM_PROMPT).trim();
  const temp = s.temperature === '' || s.temperature == null ? null : Number(s.temperature);

  if (p.type === 'anthropic') {
    const body = { model: s.model, max_tokens: 8192, stream: true, messages: history };
    if (system) body.system = system;
    if (temp !== null) body.temperature = Math.min(temp, 1);
    const res = await apiFetch(baseUrlOf(s) + '/messages', {
      method: 'POST', headers: headersFor(s), body: JSON.stringify(body), signal,
    });
    for await (const data of readSSE(res, signal)) {
      if (!data) continue;
      let j; try { j = JSON.parse(data); } catch { continue; }
      if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') yield j.delta.text;
      else if (j.type === 'error') throw new ApiError(j.error?.message || 'Erreur du fournisseur', 500);
    }
    return;
  }

  // API compatible OpenAI
  const messages = system ? [{ role: 'system', content: system }, ...history] : history;
  const body = { model: s.model, messages, stream: true };
  if (temp !== null) body.temperature = temp;
  const res = await apiFetch(baseUrlOf(s) + '/chat/completions', {
    method: 'POST', headers: headersFor(s), body: JSON.stringify(body), signal,
  });
  for await (const data of readSSE(res, signal)) {
    if (!data || data === '[DONE]') { if (data === '[DONE]') return; continue; }
    let j; try { j = JSON.parse(data); } catch { continue; }
    if (j.error) throw new ApiError(j.error.message || 'Erreur du fournisseur', 500);
    const t = j.choices?.[0]?.delta?.content;
    if (t) yield t;
  }
}

/* ---------- 6. Rendu Markdown (léger et sûr : tout le HTML est échappé) ---------- */
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inlineMd(t) {
  const codes = [];
  t = t.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0001${codes.length - 1}\u0001`; });
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  t = t.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+?)~~/g, '<del>$1</del>');
  return t.replace(/\u0001(\d+)\u0001/g, (_, i) => `<code>${codes[i]}</code>`);
}

function renderMarkdown(src) {
  const blocks = [];
  src = src.replace(/```([\w+#.-]*)[^\n]*\n?([\s\S]*?)(?:```|$)/g, (_, lang, code) => {
    blocks.push({ lang, code: code.replace(/\n$/, '') });
    return `\n\u0000${blocks.length - 1}\u0000\n`;
  });

  const lines = escapeHtml(src).split('\n');
  const out = [];
  let para = [];
  let list = null; // { tag: 'ul' | 'ol', items: [] }

  const flushPara = () => { if (para.length) { out.push(`<p>${inlineMd(para.join('<br>'))}</p>`); para = []; } };
  const flushList = () => {
    if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inlineMd(i)}</li>`).join('')}</${list.tag}>`); list = null; }
  };
  const flushAll = () => { flushPara(); flushList(); };
  const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if ((m = line.match(/^\u0000(\d+)\u0000$/))) {
      flushAll();
      const b = blocks[+m[1]];
      out.push(`<div class="code"><div class="code-head"><span>${escapeHtml(b.lang || 'code')}</span>` +
        `<button class="copy" data-code="${+m[1]}">Copier</button></div>` +
        `<pre><code>${escapeHtml(b.code)}</code></pre></div>`);
    } else if (!line.trim()) {
      flushAll();
    } else if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      flushAll();
      const lvl = Math.min(m[1].length, 4);
      out.push(`<h${lvl}>${inlineMd(m[2])}</h${lvl}>`);
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushAll(); out.push('<hr>');
    } else if ((m = line.match(/^&gt;\s?(.*)$/))) {
      flushAll(); out.push(`<blockquote>${inlineMd(m[1])}</blockquote>`);
    } else if (line.trim().startsWith('|') && lines[i + 1] && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flushAll();
      const head = cells(line);
      i += 1;
      const rows = [];
      while (lines[i + 1] && lines[i + 1].trim().startsWith('|')) { rows.push(cells(lines[i + 1])); i++; }
      out.push('<table><thead><tr>' + head.map((h) => `<th>${inlineMd(h)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + r.map((c) => `<td>${inlineMd(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
    } else if ((m = line.match(/^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/))) {
      flushPara();
      const tag = m[1] ? 'ol' : 'ul';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push(m[2]);
    } else if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += ' ' + line.trim();
    } else {
      flushList(); para.push(line);
    }
  }
  flushAll();
  return { html: out.join(''), blocks };
}

/* ---------- 7. Affichage des messages ---------- */
function scrollToBottom(force) {
  const m = el.messages;
  if (force || m.scrollHeight - m.scrollTop - m.clientHeight < 150) m.scrollTop = m.scrollHeight;
}

function createMessageEl(role) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? '🙂' : '✦';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const content = document.createElement('div');
  content.className = 'content';
  bubble.appendChild(content);
  wrap.append(avatar, bubble);
  el.messages.appendChild(wrap);
  return { wrap, bubble, content };
}

function fillAssistant(node, text) {
  const { html, blocks } = renderMarkdown(text);
  node.content.innerHTML = html;
  node.content._blocks = blocks;
}

function addTools(node, text) {
  const tools = document.createElement('div');
  tools.className = 'msg-tools';
  const copy = document.createElement('button');
  copy.textContent = '📋 Copier la réponse';
  copy.addEventListener('click', () => copyText(text, copy));
  tools.appendChild(copy);
  node.bubble.appendChild(tools);
}

function renderMessage(msg) {
  const node = createMessageEl(msg.role);
  if (msg.role === 'user') node.content.textContent = msg.content;
  else { fillAssistant(node, msg.content); addTools(node, msg.content); }
  return node;
}

function renderAll() {
  el.messages.querySelectorAll('.msg').forEach((n) => n.remove());
  el.empty.classList.toggle('hidden', state.messages.length > 0);
  state.messages.forEach(renderMessage);
  scrollToBottom(true);
}

function showError(text) {
  const node = createMessageEl('error');
  node.wrap.classList.add('assistant');
  node.content.textContent = '⚠️ ' + text;
  scrollToBottom(true);
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = '✓ Copié';
    setTimeout(() => { btn.textContent = old; }, 1500);
  } catch { /* presse-papiers indisponible */ }
}

// Boutons "Copier" des blocs de code (délégation d'événements)
el.messages.addEventListener('click', (e) => {
  const btn = e.target.closest('.copy');
  if (!btn) return;
  const blocks = btn.closest('.content')?._blocks;
  if (blocks) copyText(blocks[+btn.dataset.code].code, btn);
});

/* ---------- 8. Envoi d'un message ---------- */
function setBusy(busy) {
  el.send.classList.toggle('hidden', busy);
  el.stop.classList.toggle('hidden', !busy);
  el.modelSelect.disabled = busy;
}

async function sendMessage(text) {
  text = text.trim();
  if (!text || state.controller) return;
  if (!state.settings.model) { openSetup(true); return; }

  el.empty.classList.add('hidden');
  state.messages.push({ role: 'user', content: text });
  saveHistory();
  renderMessage(state.messages[state.messages.length - 1]);
  el.input.value = '';
  autoResize();
  scrollToBottom(true);

  const node = createMessageEl('assistant');
  node.content.classList.add('cursor');
  scrollToBottom(true);

  const controller = new AbortController();
  state.controller = controller;
  setBusy(true);

  let answer = '';
  let pending = false;
  const paint = () => {
    pending = false;
    fillAssistant(node, answer);
    scrollToBottom();
  };

  try {
    const history = state.messages.map(({ role, content }) => ({ role, content }));
    for await (const chunk of streamChat(state.settings, history, controller.signal)) {
      answer += chunk;
      if (!pending) { pending = true; requestAnimationFrame(paint); }
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      if (!answer) {
        // on retire la question pour pouvoir la renvoyer
        node.wrap.remove();
        state.messages.pop();
        saveHistory();
        el.input.value = text;
        autoResize();
      }
      showError(e.message || String(e));
      if (e.status === 401) setTimeout(() => openSetup(true, 'Votre clé API a été refusée. Vérifiez-la.'), 600);
    }
  } finally {
    state.controller = null;
    setBusy(false);
    node.content.classList.remove('cursor');
    if (answer) {
      fillAssistant(node, answer);
      addTools(node, answer);
      state.messages.push({ role: 'assistant', content: answer });
      saveHistory();
    } else if (node.wrap.isConnected) {
      node.wrap.remove();
    }
    el.input.focus();
  }
}

/* ---------- 9. Sélecteur de modèles ---------- */
const OTHER_MODEL = '__other__';

function fillModelSelect() {
  const s = state.settings;
  const list = [...state.models];
  if (s.model && !list.includes(s.model)) list.unshift(s.model);
  el.modelSelect.innerHTML = '';
  list.forEach((id) => el.modelSelect.add(new Option(id, id, false, id === s.model)));
  el.modelSelect.add(new Option('✎ Autre modèle…', OTHER_MODEL));
  el.badge.textContent = providerOf(s).label.replace(/\s*\(.*\)$/, '');
}

el.modelSelect.addEventListener('change', () => {
  let v = el.modelSelect.value;
  if (v === OTHER_MODEL) {
    v = (prompt('Nom exact du modèle à utiliser :', state.settings.model || '') || '').trim();
    if (!v) { fillModelSelect(); return; }
  }
  state.settings.model = v;
  saveSettings(state.settings);
  fillModelSelect();
});

function pickModel(models, s) {
  const p = providerOf(s);
  if (s.model && models.includes(s.model)) return s.model;
  if (p.defaultModel && models.includes(p.defaultModel)) return p.defaultModel;
  return models[0] || p.defaultModel || s.model || '';
}

/* ---------- 10. Écran de connexion / paramètres ---------- */
Object.entries(PROVIDERS).forEach(([id, p]) => el.providerSelect.add(new Option(p.label, id)));

function updateProviderFields() {
  const p = PROVIDERS[el.providerSelect.value];
  el.baseUrlField.classList.toggle('hidden', !p.custom);
  el.baseUrl.required = !!p.custom;
  el.apiKey.required = !p.keyOptional;
  el.apiKey.placeholder = p.keyHint;
  el.keyLink.classList.toggle('hidden', !p.keyUrl);
  if (p.keyUrl) { el.keyLink.href = p.keyUrl; el.keyLink.textContent = `Obtenir une clé ${p.label.split(' (')[0]} ↗`; }
}

function openSetup(isEdit, errorMsg) {
  const s = state.settings;
  el.providerSelect.value = PROVIDERS[s.provider] ? s.provider : 'groq';
  el.baseUrl.value = s.baseUrl || '';
  el.apiKey.value = s.apiKey || '';
  el.remember.checked = !!s.remember;
  el.systemPrompt.value = s.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  el.temperature.value = s.temperature ?? '';
  el.setupTitle.textContent = isEdit ? 'Paramètres' : 'Bienvenue 👋';
  el.connect.textContent = isEdit ? 'Enregistrer' : 'Se connecter';
  el.cancelSetup.classList.toggle('hidden', !(isEdit && s.provider && (s.apiKey || providerOf(s).keyOptional)));
  setSetupError(errorMsg || '');
  updateProviderFields();
  el.overlay.classList.remove('hidden');
  setTimeout(() => (el.apiKey.value ? el.connect : el.apiKey).focus(), 50);
}

function closeSetup() { el.overlay.classList.add('hidden'); el.input.focus(); }
function setSetupError(msg) { el.setupError.textContent = msg; el.setupError.classList.toggle('hidden', !msg); }

el.providerSelect.addEventListener('change', () => {
  // On ne garde pas la clé d'un autre fournisseur
  if (el.providerSelect.value !== state.settings.provider) el.apiKey.value = '';
  updateProviderFields();
  setSetupError('');
});
el.toggleKey.addEventListener('click', () => {
  el.apiKey.type = el.apiKey.type === 'password' ? 'text' : 'password';
});
el.cancelSetup.addEventListener('click', closeSetup);

el.setupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const provider = el.providerSelect.value;
  const draft = {
    ...state.settings,
    provider,
    apiKey: el.apiKey.value.trim(),
    baseUrl: el.baseUrl.value.trim(),
    remember: el.remember.checked,
    systemPrompt: el.systemPrompt.value,
    temperature: el.temperature.value,
  };
  if (provider !== state.settings.provider) draft.model = '';

  setSetupError('');
  el.connect.disabled = true;
  el.connect.textContent = 'Vérification…';
  try {
    let models = [];
    try {
      models = await listModels(draft);
    } catch (err) {
      if (err.status === 401 || err.status === 403) throw err; // clé refusée : on bloque
      console.warn('Liste des modèles indisponible :', err.message);
    }
    draft.model = pickModel(models, draft);
    if (!draft.model) {
      const m = (prompt('Impossible de récupérer la liste des modèles. Saisissez le nom du modèle à utiliser :') || '').trim();
      if (!m) throw new Error('Aucun modèle sélectionné.');
      draft.model = m;
    }
    state.settings = draft;
    state.models = models;
    saveSettings(draft);
    fillModelSelect();
    closeSetup();
  } catch (err) {
    setSetupError(err.message || String(err));
  } finally {
    el.connect.disabled = false;
    el.connect.textContent = el.setupTitle.textContent === 'Paramètres' ? 'Enregistrer' : 'Se connecter';
  }
});

/* ---------- 11. Boutons de la barre et zone de saisie ---------- */
$('newChatBtn').addEventListener('click', () => {
  if (state.controller) state.controller.abort();
  state.messages = [];
  saveHistory();
  renderAll();
  el.input.focus();
});
$('settingsBtn').addEventListener('click', () => openSetup(true));
$('logoutBtn').addEventListener('click', () => {
  if (!confirm('Se déconnecter ? Votre clé API et l\'historique seront effacés de ce navigateur.')) return;
  if (state.controller) state.controller.abort();
  localStorage.removeItem(STORE_KEY);
  sessionStorage.removeItem(STORE_KEY);
  localStorage.removeItem(STORE_HISTORY);
  state.settings = { ...state.settings, apiKey: '', model: '' };
  saveSettings(state.settings);
  state.messages = [];
  state.models = [];
  renderAll();
  openSetup(false);
});

el.stop.addEventListener('click', () => state.controller?.abort());
el.form.addEventListener('submit', (e) => { e.preventDefault(); sendMessage(el.input.value); });
el.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMessage(el.input.value); }
});
function autoResize() {
  el.input.style.height = 'auto';
  el.input.style.height = Math.min(el.input.scrollHeight, 220) + 'px';
}
el.input.addEventListener('input', autoResize);
document.querySelectorAll('.suggestion').forEach((b) =>
  b.addEventListener('click', () => sendMessage(b.textContent)));

/* ---------- 12. Démarrage ---------- */
(async function init() {
  renderAll();
  const s = state.settings;
  const ready = s.provider && s.model && (s.apiKey || providerOf(s).keyOptional);
  if (!ready) { openSetup(false); return; }
  fillModelSelect();
  el.input.focus();
  try {
    state.models = await listModels(s);
    fillModelSelect();
  } catch (err) {
    if (err.status === 401) openSetup(true, 'Votre clé API a été refusée. Vérifiez-la.');
  }
})();
