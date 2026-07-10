// utils.js - utilitários globais (portado de controle-financeiro/Site_Controle/js/utils.js)
function formatCurrency(value, locale='pt-BR', currency='BRL') {
  const number = Number(value) || 0;
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(number);
}

function formatDate(dateInput, locale='pt-BR') {
  // Data-só ("2026-07-10") precisa de T00:00:00 local — new Date() puro interpreta
  // como UTC-meia-noite e no Brasil exibe o dia anterior.
  const date = dateInput instanceof Date
    ? dateInput
    : new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateInput) ? dateInput + 'T00:00:00' : dateInput);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function parseBrazilianDate(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim();

  const brazilPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const brazilMatch = str.match(brazilPattern);
  if (brazilMatch) {
    const [, day, month, year] = brazilMatch;
    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    if (m < 1 || m > 12) return null;
    if (d < 1 || d > 31) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCDate() !== d) return null;
    return date.toISOString().split('T')[0];
  }

  const isoPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
  const isoMatch = str.match(isoPattern);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    if (m < 1 || m > 12) return null;
    if (d < 1 || d > 31) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCDate() !== d) return null;
    return date.toISOString().split('T')[0];
  }

  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return null;
}

function isValidDateString(dateStr) {
  return parseBrazilianDate(dateStr) !== null;
}

function parseDateToISO(value) {
  if (!value) return null;
  const result = parseBrazilianDate(value);
  if (result) return result;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function generateId(prefix='id') {
  const random = Math.random().toString(36).substr(2, 9);
  return `${prefix}-${Date.now()}-${random}`;
}

function calculateMonth(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  return d.getMonth() + 1;
}

function calculateYear(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

function calculateCompetencia(dateInput) {
  const month = calculateMonth(dateInput);
  const year = calculateYear(dateInput);
  return month && year ? `${String(month).padStart(2, '0')}/${year}` : '';
}

function getWeekday(dateInput, locale='pt-BR') {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d);
}

function sortByDate(items, dateField='data', direction='asc') {
  const factor = direction === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const da = new Date(a[dateField]).getTime() || 0;
    const db = new Date(b[dateField]).getTime() || 0;
    return (da - db) * factor;
  });
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;

  const rawData = entry.data || entry.date || entry.dataISO || entry.dateISO;
  const dateISO = parseDateToISO(rawData) || new Date().toISOString().split('T')[0];
  const month = calculateMonth(dateISO);
  const year = calculateYear(dateISO);
  const competence = calculateCompetencia(dateISO);
  const weekday = getWeekday(dateISO);

  const rawAmount = entry.amount != null ? entry.amount : entry.valor;
  const amount = Number(rawAmount || 0);

  const entryType = entry.entryType || entry.tipo || 'despesa';
  const recurring = typeof entry.recurring === 'boolean' ? entry.recurring : ['sim', 'true', '1', 'verdadeiro'].includes(String(entry.recorrente || '').toLowerCase());
  const fixedOrVariable = entry.fixedOrVariable || entry.fixoVariavel || 'variavel';

  const status = entry.status || (entry.statusId ? String(entry.statusId) : null);
  const paymentType = entry.paymentType || (entry.pagamentoId ? String(entry.pagamentoId) : null);

  const category = entry.category || (entry.categoriaId ? String(entry.categoriaId) : null);
  const subcategory = entry.subcategory || (entry.subcategoriaId ? String(entry.subcategoriaId) : null);
  const responsible = entry.responsible || (entry.responsavelId ? String(entry.responsavelId) : null);

  const normalized = {
    id: entry.id,
    date: dateISO,
    data: dateISO,
    month,
    year,
    competence,
    weekday,
    entryType,
    tipo: entryType,
    responsible,
    responsavelId: entry.responsavelId || responsible,
    category,
    categoriaId: entry.categoriaId || category,
    subcategory,
    subcategoriaId: entry.subcategoriaId || subcategory,
    description: entry.description || entry.descricao || '',
    descricao: entry.descricao || entry.description || '',
    amount,
    valor: amount,
    notes: entry.notes || entry.observacao || entry.obs || '',
    observacao: entry.observacao || entry.notes || entry.obs || '',
    obs: entry.obs || entry.observacao || entry.notes || '',
    status,
    statusId: entry.statusId || status,
    recurring,
    recorrente: recurring,
    fixedOrVariable,
    fixoVariavel: fixedOrVariable,
    paymentType,
    pagamentoId: entry.pagamentoId || paymentType,
    criadoEm: entry.criadoEm || entry.criado_em || new Date().toISOString(),
    atualizadoEm: entry.atualizadoEm || new Date().toISOString(),
  };

  return normalized;
}

// Palavra-chave -> pedaço do nome da categoria (comparado sem acento/maiúscula).
// Usado tanto no lançamento manual (sugerir categoria enquanto digita a descrição)
// quanto na importação de extrato — mesma lógica, um lugar só.
var CATEGORIA_KEYWORDS = {
  'alimenta': ['ifood','rappi','restaurante','lanchonete','padaria','mercado','supermercado','feira','acougue'],
  'transporte': ['uber','99','taxi','combustivel','posto','gasolina','estacionamento','pedagio','onibus','metro'],
  'compras': ['shopee','amazon','magalu','mercadolivre','shein','loja','magazine'],
  'saude': ['farmacia','drogaria','academia','wellhub','gympass','consulta','exame'],
  'assinatura': ['netflix','spotify','disney','hbo','amazon prime','icloud','youtube premium'],
  'casa': ['condominio','aluguel','luz','agua','energia','internet','gas'],
  'lazer': ['cinema','bar','balada','ingresso','show'],
  'educa': ['curso','faculdade','escola','livro'],
  'doa': ['dizimo','doacao','igreja'],
};

function stripAccents(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,''); }

function sugerirCategoriaPorTexto(texto, categorias) {
  var t = stripAccents(texto).toLowerCase();
  for (var chave in CATEGORIA_KEYWORDS) {
    var achou = CATEGORIA_KEYWORDS[chave].some(function(kw){ return t.indexOf(kw) !== -1; });
    if (achou) {
      var cat = categorias.find(function(c){ return stripAccents(c.nome).toLowerCase().indexOf(chave) !== -1; });
      if (cat) return cat.id;
    }
  }
  return null;
}

window.Utils = {
  formatCurrency,
  formatDate,
  parseBrazilianDate,
  isValidDateString,
  parseDateToISO,
  generateId,
  calculateMonth,
  calculateYear,
  calculateCompetencia,
  getWeekday,
  sortByDate,
  normalizeEntry,
  sugerirCategoriaPorTexto,
};
