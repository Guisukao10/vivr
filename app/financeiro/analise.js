// analise.js - dashboard principal do módulo financeiro
// Portado de controle-financeiro/Site_Controle/js/dashboard.js (versão com filtro de período,
// mais completa que analise.js do mesmo repo — consolidamos nesta única página, como
// planejado no Passo 6). Somente leitura (StorageService.getLancamentos()), sem escritas,
// então não precisou de adaptação assíncrona além do carregamento inicial.
const AnalisePage = (function () {
  let charts = {};

  function getLancamentos() {
    return StorageService.getLancamentos() || [];
  }

  function getCurrentMonthYear() {
    const now = new Date();
    return {
      mes: now.getMonth() + 1,
      ano: now.getFullYear(),
      comp: `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`,
    };
  }

  function getCompetencias(lancamentos) {
    return Array.from(
      new Set((lancamentos || []).map((l) => Utils.calculateCompetencia(l.data)).filter((c) => c))
    ).sort((a, b) => {
      const [ma, ya] = a.split('/').map(Number);
      const [mb, yb] = b.split('/').map(Number);
      return ya - yb || ma - mb;
    });
  }

  function getInitialPeriodo(lancamentos) {
    const currentComp = getCurrentMonthYear().comp;
    const comps = getCompetencias(lancamentos);
    if (comps.includes(currentComp)) return currentComp;
    if (comps.length) return comps[comps.length - 1];
    return 'all';
  }

  function setupPeriodFilter() {
    const select = document.getElementById('periodFilter');
    if (!select) return;

    const comps = getCompetencias(getLancamentos());
    select.innerHTML = '';

    const optionAll = document.createElement('option');
    optionAll.value = 'all';
    optionAll.textContent = 'Todos os períodos';
    select.appendChild(optionAll);

    comps.forEach((comp) => {
      const option = document.createElement('option');
      option.value = comp;
      option.textContent = comp;
      select.appendChild(option);
    });

    select.value = getInitialPeriodo(getLancamentos()) || 'all';
    select.addEventListener('change', () => renderByPeriodo());
  }

  function getSelectedPeriod() {
    const select = document.getElementById('periodFilter');
    return (select && select.value) || 'all';
  }

  function filterByPeriodo(lancamentos, periodo) {
    if (!Array.isArray(lancamentos)) return [];
    if (!periodo || periodo === 'all') return [...lancamentos];
    return lancamentos.filter((item) => Utils.calculateCompetencia(item.data) === periodo);
  }

  function getDiasNoPeriodo(periodo) {
    if (!periodo || periodo === 'all') return 0;
    const [mes, ano] = periodo.split('/').map(Number);
    if (!mes || !ano) return 0;
    return new Date(ano, mes, 0).getDate();
  }

  function calculateTotals(filteredLancamentos, allLancamentos, periodo) {
    const all = Array.isArray(allLancamentos) ? allLancamentos : [];
    const filtro = Array.isArray(filteredLancamentos) ? filteredLancamentos : [];

    const totalGeral = all.reduce((sum, item) => sum + (item.tipo === 'despesa' ? -Number(item.valor || 0) : Number(item.valor || 0)), 0);
    const ganhos = filtro.filter((x) => x.tipo === 'receita').reduce((sum, x) => sum + Number(x.valor || 0), 0);
    const gastos = filtro.filter((x) => x.tipo === 'despesa').reduce((sum, x) => sum + Number(x.valor || 0), 0);
    const saldoPeriodo = ganhos - gastos;

    const dias = getDiasNoPeriodo(periodo);
    const mediaDiariaGastos = dias ? gastos / dias : 0;

    const gastosPorCategoria = filtro
      .filter((x) => x.tipo === 'despesa')
      .reduce((acc, item) => {
        const key = UI.mapCategoryName(item.categoriaId);
        acc[key] = (acc[key] || 0) + Number(item.valor || 0);
        return acc;
      }, {});

    const maiorCategoriaEntry = Object.entries(gastosPorCategoria).sort((a, b) => b[1] - a[1])[0] || ['Nenhuma', 0];

    return {
      totalGeral, saldoPeriodo, ganhos, gastos, mediaDiariaGastos,
      maiorCategoria: maiorCategoriaEntry[0],
      totalLancamentosPeriodo: filtro.length,
      mensal: filtro,
      gastosPorCategoria,
    };
  }

  function buildCard(title, value, variant = 'default') {
    const card = document.createElement('div');
    card.className = `dashboard-card dashboard-card-${variant}`;
    card.innerHTML = `<div class="card-title">${title}</div><div class="card-value">${value}</div>`;
    return card;
  }

  // O primeiro número que a pessoa vê precisa responder "como estou indo", não pedir
  // que ela some 7 cards pra descobrir sozinha. Isso é o objetivo do módulo: reduzir a
  // distância entre "ver o número" e "saber o que fazer com ele".
  function renderHero(totais, periodo) {
    const hero = document.getElementById('finHero');
    if (!hero || !totais) return;
    const pos = totais.saldoPeriodo >= 0;
    const labelPeriodo = periodo === 'all' ? 'no total' : 'neste período';
    hero.className = 'fin-hero ' + (pos ? 'pos' : 'neg');
    hero.innerHTML = `
      <div class="fin-hero-label">${pos ? 'Sobrou' : 'Faltou'} ${labelPeriodo}</div>
      <div class="fin-hero-value">${Utils.formatCurrency(Math.abs(totais.saldoPeriodo))}</div>
      <div class="fin-hero-sub">${pos ? 'Você ganhou mais do que gastou — dá pra guardar essa diferença.' : 'Você gastou mais do que ganhou — vale olhar onde cortar.'}</div>
      <div class="fin-hero-breakdown">
        <div>Entrou<strong>${Utils.formatCurrency(totais.ganhos)}</strong></div>
        <div>Saiu<strong>${Utils.formatCurrency(totais.gastos)}</strong></div>
        <div>Saldo acumulado (todo o histórico)<strong>${Utils.formatCurrency(totais.totalGeral)}</strong></div>
      </div>`;
  }

  function renderCards(totais, periodo, totalRegistros, registrosPeriodo) {
    const container = document.getElementById('summaryCards');
    container.innerHTML = '';

    if (!totais || totalRegistros === 0) {
      container.textContent = 'Nenhum lançamento disponível. Cadastre lançamentos para visualizar o dashboard.';
      return;
    }
    if (registrosPeriodo === 0) {
      container.textContent = 'Não há dados no período selecionado. Selecione outro período ou Todos os períodos.';
      return;
    }

    container.appendChild(buildCard('Média diária de gastos', Utils.formatCurrency(totais.mediaDiariaGastos), 'warning'));
    container.appendChild(buildCard('Onde mais gastou', totais.maiorCategoria, 'info'));

    // Comparação direta com o mês anterior — responde "estou gastando mais ou menos?"
    const cmp = getGastosVsMesAnterior(periodo);
    if (cmp) {
      const seta = cmp.delta > 0 ? '▲' : '▼';
      const txt = `${seta} ${Math.abs(cmp.deltaPct).toFixed(0)}% (${Utils.formatCurrency(cmp.anterior)} → ${Utils.formatCurrency(cmp.atual)})`;
      container.appendChild(buildCard('Gastos vs mês anterior', txt, cmp.delta > 0 ? 'danger' : 'success'));
    }
  }

  // Gastos do período atual vs o mês imediatamente anterior (histórico completo).
  function getGastosVsMesAnterior(periodo) {
    if (!periodo || periodo === 'all') return null;
    const [mes, ano] = periodo.split('/').map(Number);
    if (!mes || !ano) return null;
    const antD = new Date(ano, mes - 2, 1);
    const compAnt = `${String(antD.getMonth() + 1).padStart(2, '0')}/${antD.getFullYear()}`;
    const gastosDe = (comp) => getLancamentos()
      .filter((l) => l.tipo === 'despesa' && Utils.calculateCompetencia(l.data) === comp)
      .reduce((s, l) => s + Number(l.valor || 0), 0);
    const atual = gastosDe(periodo);
    const anterior = gastosDe(compAnt);
    if (!anterior) return null;
    const delta = atual - anterior;
    return { atual, anterior, delta, deltaPct: (delta / anterior) * 100 };
  }

  function getSeriesPorMes(periodo) {
    let lancamentos = getLancamentos();
    if (periodo && periodo !== 'all') lancamentos = filterByPeriodo(lancamentos, periodo);

    const agreg = {};
    lancamentos.forEach((l) => {
      const comp = Utils.calculateCompetencia(l.data);
      if (!comp) return;
      if (!agreg[comp]) agreg[comp] = { receita: 0, despesa: 0 };
      agreg[comp][l.tipo] += Number(l.valor || 0);
    });

    const labels = Object.keys(agreg).sort((a, b) => {
      const [ma, ya] = a.split('/').map(Number);
      const [mb, yb] = b.split('/').map(Number);
      return ya - yb || ma - mb;
    });

    return {
      labels,
      receita: labels.map((lab) => agreg[lab].receita),
      despesa: labels.map((lab) => agreg[lab].despesa),
      saldo: labels.map((lab) => agreg[lab].receita - agreg[lab].despesa),
    };
  }

  function getComparacaoResponsavel(periodo) {
    const lancamentos = filterByPeriodo(getLancamentos(), periodo);
    const agreg = {};
    lancamentos.filter((x) => x.tipo === 'despesa').forEach((x) => {
      const key = UI.mapResponsavelName(x.responsavelId);
      agreg[key] = (agreg[key] || 0) + Number(x.valor || 0);
    });
    return { labels: Object.keys(agreg), data: Object.values(agreg) };
  }

  function mountChart(canvasId, type, data, options = {}) {
    if (!document.getElementById(canvasId)) return null;
    const ctx = document.getElementById(canvasId).getContext('2d');
    return new Chart(ctx, { type, data, options });
  }

  // Um gráfico só (tendência do saldo — "estou melhorando?"). Distribuição por
  // categoria virou lista de barras (renderResumoCategoria): comparar fatias de
  // pizza de olho é impreciso, uma lista ordenada com % é direta.
  function renderCharts(periodo) {
    Object.values(charts).forEach((c) => c && c.destroy && c.destroy());
    charts = {};

    const totais = calculateTotals(filterByPeriodo(getLancamentos(), periodo), getLancamentos(), periodo);
    if (!totais || totais.totalLancamentosPeriodo === 0) return;

    const series = getSeriesPorMes(periodo);
    charts.saldoEvolucao = mountChart('chartSaldoEvolucao', 'line', {
      labels: series.labels,
      datasets: [{ label: 'Saldo', data: series.saldo, borderColor: '#005f73', backgroundColor: 'rgba(0,95,115,0.16)', fill: true, tension: 0.3 }],
    }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 10 } } } } });

    // Comparativo Entrou × Saiu: sempre os últimos 6 meses do histórico completo,
    // independente do filtro — comparar meses é o ponto do gráfico.
    const full = getSeriesPorMes('all');
    const n = Math.min(6, full.labels.length);
    charts.comparativo = mountChart('chartComparativo', 'bar', {
      labels: full.labels.slice(-n),
      datasets: [
        { label: 'Entrou', data: full.receita.slice(-n), backgroundColor: 'rgba(21,128,61,.75)', borderRadius: 4 },
        { label: 'Saiu', data: full.despesa.slice(-n), backgroundColor: 'rgba(185,28,28,.7)', borderRadius: 4 },
      ],
    }, {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { boxWidth: 14, font: { size: 11 } } },
        tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + Utils.formatCurrency(c.parsed.y) } },
      },
      scales: { y: { beginAtZero: true, ticks: { font: { size: 10 }, callback: (v) => 'R$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v) } }, x: { ticks: { font: { size: 10 } } } },
    });
  }

  function renderGastosPorResponsavel(periodo) {
    const container = document.getElementById('gastosResponsavel');
    if (!container) return;
    const resp = getComparacaoResponsavel(periodo);
    if (!resp.labels.length) { container.textContent = 'Sem gastos no período.'; return; }
    const max = Math.max(...resp.data);
    container.innerHTML = resp.labels.map((lbl, i) => `
      <div class="fin-list-row">
        <span>${lbl}</span>
        <div class="fin-list-bar"><div class="fin-list-bar-fill" style="width:${max ? (resp.data[i] / max * 100) : 0}%"></div></div>
        <strong>${Utils.formatCurrency(resp.data[i])}</strong>
      </div>`).join('');
  }

  // Metas financeiras com categoria vinculada — progresso já veio calculado
  // (StorageService.sincronizarProgressoMetas roda no boot da página).
  function renderMetasFinanceiras() {
    const box = document.getElementById('metasFinBox');
    const list = document.getElementById('metasFinList');
    if (!box || !list || !StorageService.getMetasFinanceirasVinculadas) return;
    const vinculadas = StorageService.getMetasFinanceirasVinculadas();
    if (!vinculadas.length) { box.style.display = 'none'; return; }
    box.style.display = '';
    list.innerHTML = vinculadas.map((v) => {
      const pct = v.progressoCalculado !== null ? v.progressoCalculado : (v.goal.progress || 0);
      return `<div class="fin-goal-row">
        <span class="fin-goal-name">${v.goal.title}</span>
        <div class="fin-goal-track"><div class="fin-goal-fill" style="width:${pct}%"></div></div>
        <span class="fin-goal-pct">${pct}%</span>
      </div>`;
    }).join('');
  }

  function renderRecentAndTop(periodo) {
    const filtrados = filterByPeriodo(getLancamentos(), periodo);
    const ultimos = filtrados.slice().sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 5);

    const container = document.getElementById('ultimosLancamentos');
    if (!container) return;
    container.innerHTML = '';
    if (!ultimos.length) { container.textContent = 'Sem lançamentos no período.'; return; }
    const table = document.createElement('table');
    table.className = 'grid-table small-table';
    table.innerHTML = '<thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead>';
    const body = document.createElement('tbody');
    ultimos.forEach((item) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${Utils.formatDate(item.data)}</td><td>${item.descricao}</td><td>${UI.mapCategoryName(item.categoriaId)}</td><td>${Utils.formatCurrency(item.valor)}</td>`;
      body.appendChild(tr);
    });
    table.appendChild(body);
    container.appendChild(table);
  }

  // Lista ordenada com barra e % do total — mais fácil de comparar de relance do que
  // uma pizza (comparar ângulo de fatia é impreciso) ou uma tabela crua de números.
  function renderResumoCategoria(totais) {
    const container = document.getElementById('resumoCategoria');
    container.innerHTML = '';
    const entries = totais && totais.gastosPorCategoria ? Object.entries(totais.gastosPorCategoria) : [];
    if (!entries.length) { container.textContent = 'Sem gastos no período.'; return; }

    entries.sort((a, b) => b[1] - a[1]);
    const totalGasto = entries.reduce((s, [, v]) => s + v, 0);
    const max = entries[0][1];

    container.innerHTML = entries.map(([cat, valor]) => {
      const pct = totalGasto ? Math.round(valor / totalGasto * 100) : 0;
      return `<div class="cat-bar-row">
        <div class="cat-bar-top"><span class="cat-name">${cat}</span><span>${Utils.formatCurrency(valor)} · ${pct}%</span></div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${max ? (valor / max * 100) : 0}%"></div></div>
      </div>`;
    }).join('');
  }

  function renderPeriodInfo(periodo, registrosPeriodo, totalRegistros) {
    const label = document.getElementById('activePeriodInfo');
    if (!label) return;
    if (!totalRegistros) { label.textContent = 'Nenhum lançamento cadastrado.'; return; }
    if (periodo === 'all') { label.textContent = `Exibindo todos os períodos (${registrosPeriodo} lançamentos).`; return; }
    label.textContent = `Período: ${periodo} (${registrosPeriodo} de ${totalRegistros} lançamentos).`;
  }

  function renderByPeriodo() {
    const allLancamentos = getLancamentos();
    const selectedPeriod = getSelectedPeriod();
    const filtered = filterByPeriodo(allLancamentos, selectedPeriod);
    const totais = calculateTotals(filtered, allLancamentos, selectedPeriod);

    renderPeriodInfo(selectedPeriod, filtered.length, allLancamentos.length);
    const hero = document.getElementById('finHero');
    if (!allLancamentos.length) {
      hero.className = 'fin-hero';
      hero.innerHTML = '<div class="fin-hero-label">Comece por aqui</div><div class="fin-hero-sub" style="margin-top:6px">Nenhum lançamento cadastrado ainda. Registre seus ganhos e gastos pra ver como você está indo.</div>';
    } else if (!filtered.length) {
      hero.className = 'fin-hero';
      hero.innerHTML = '<div class="fin-hero-label">Sem dados neste período</div><div class="fin-hero-sub" style="margin-top:6px">Escolha outro período ou "Todos os períodos".</div>';
    } else {
      renderHero(totais, selectedPeriod);
    }
    renderCards(totais, selectedPeriod, allLancamentos.length, filtered.length);
    renderCharts(selectedPeriod);
    renderGastosPorResponsavel(selectedPeriod);
    renderRecentAndTop(selectedPeriod);
    renderResumoCategoria(totais);
    renderMetasFinanceiras();
  }

  // Módulo precisa abrir mesmo com o banco vazio (conta nova, sem nenhum lançamento
  // ainda) ou se o Supabase estiver momentaneamente fora do ar — nunca travar em branco.
  function init() {
    try {
      setupPeriodFilter();
      renderByPeriodo();
    } catch (e) {
      const cards = document.getElementById('summaryCards');
      if (cards) cards.innerHTML = `<div class="panel" style="grid-column:1/-1;color:var(--color-danger)">⚠️ Erro ao montar a tela: ${e.message}</div>`;
    }
  }

  return { init };
})();

window.AnalisePage = AnalisePage;
