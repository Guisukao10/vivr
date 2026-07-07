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

    const totalGeral = all.reduce((sum, item) => sum + Number(item.valor || 0), 0);
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

    container.appendChild(buildCard('Saldo total geral', Utils.formatCurrency(totais.totalGeral), 'primary'));
    container.appendChild(buildCard('Saldo no período', Utils.formatCurrency(totais.saldoPeriodo), totais.saldoPeriodo >= 0 ? 'success' : 'warning'));
    container.appendChild(buildCard('Ganhos no período', Utils.formatCurrency(totais.ganhos), 'success'));
    container.appendChild(buildCard('Gastos no período', Utils.formatCurrency(totais.gastos), 'danger'));
    container.appendChild(buildCard('Média diária gastos', Utils.formatCurrency(totais.mediaDiariaGastos), 'warning'));
    container.appendChild(buildCard('Maior categoria gasto', totais.maiorCategoria, 'info'));
    container.appendChild(buildCard('Qtd lançamentos no período', String(totais.totalLancamentosPeriodo), 'info'));
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

  function renderCharts(periodo) {
    Object.values(charts).forEach((c) => c && c.destroy && c.destroy());
    charts = {};

    const totais = calculateTotals(filterByPeriodo(getLancamentos(), periodo), getLancamentos(), periodo);
    if (!totais || totais.totalLancamentosPeriodo === 0) return;

    charts.gastosCategoria = mountChart('chartGastosCategoria', 'pie', {
      labels: Object.keys(totais.gastosPorCategoria),
      datasets: [{ label: 'Gastos por categoria', data: Object.values(totais.gastosPorCategoria), backgroundColor: ['#ff6b6b', '#fca311', '#3a86ff', '#8d99ae', '#06d6a0'] }],
    }, { responsive: true, plugins: { legend: { position: 'bottom' } } });

    const series = getSeriesPorMes(periodo);

    charts.gastosMes = mountChart('chartGastosMes', 'bar', {
      labels: series.labels,
      datasets: [{ label: 'Gastos', data: series.despesa, backgroundColor: '#ef476f' }],
    }, { responsive: true, scales: { y: { beginAtZero: true } } });

    charts.ganhosMes = mountChart('chartGanhosMes', 'bar', {
      labels: series.labels,
      datasets: [{ label: 'Ganhos', data: series.receita, backgroundColor: '#2ec4b6' }],
    }, { responsive: true, scales: { y: { beginAtZero: true } } });

    charts.saldoEvolucao = mountChart('chartSaldoEvolucao', 'line', {
      labels: series.labels,
      datasets: [{ label: 'Saldo', data: series.saldo, borderColor: '#005f73', backgroundColor: 'rgba(0,95,115,0.16)', fill: true }],
    }, { responsive: true, scales: { y: { beginAtZero: true } } });

    const resp = getComparacaoResponsavel(periodo);
    charts.gastosResponsavel = mountChart('chartGastosResponsavel', 'bar', {
      labels: resp.labels,
      datasets: [{ label: 'Gastos por responsável', data: resp.data, backgroundColor: '#ffb703' }],
    }, { responsive: true, scales: { y: { beginAtZero: true } } });
  }

  function renderRecentAndTop(periodo) {
    const filtrados = filterByPeriodo(getLancamentos(), periodo);
    const ultimos = filtrados.slice().sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 5);
    const top5 = filtrados.filter((x) => x.tipo === 'despesa').slice().sort((a, b) => b.valor - a.valor).slice(0, 5);

    const renderList = (id, list, emptyText = 'Sem dados.') => {
      const container = document.getElementById(id);
      container.innerHTML = '';
      if (!list.length) { container.textContent = emptyText; return; }
      const table = document.createElement('table');
      table.className = 'grid-table small-table';
      table.innerHTML = '<thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead>';
      const body = document.createElement('tbody');
      list.forEach((item) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${Utils.formatDate(item.data)}</td><td>${item.descricao}</td><td>${UI.mapCategoryName(item.categoriaId)}</td><td>${Utils.formatCurrency(item.valor)}</td>`;
        body.appendChild(tr);
      });
      table.appendChild(body);
      container.appendChild(table);
    };

    renderList('ultimosLancamentos', ultimos, 'Sem lançamentos no período.');
    renderList('top5Gastos', top5, 'Sem gastos no período.');
  }

  function renderResumoCategoria(totais) {
    const container = document.getElementById('resumoCategoria');
    container.innerHTML = '';
    const entries = totais && totais.gastosPorCategoria ? Object.entries(totais.gastosPorCategoria) : [];
    if (!entries.length) { container.textContent = 'Sem gastos no período.'; return; }

    const table = document.createElement('table');
    table.className = 'grid-table small-table';
    table.innerHTML = '<thead><tr><th>Categoria</th><th>Total</th></tr></thead>';
    const body = document.createElement('tbody');
    entries.sort((a, b) => b[1] - a[1]).forEach(([cat, valor]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${cat}</td><td>${Utils.formatCurrency(valor)}</td>`;
      body.appendChild(tr);
    });
    table.appendChild(body);
    container.appendChild(table);
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
    renderCards(totais, selectedPeriod, allLancamentos.length, filtered.length);
    renderCharts(selectedPeriod);
    renderRecentAndTop(selectedPeriod);
    renderResumoCategoria(totais);
  }

  function init() {
    setupPeriodFilter();
    renderByPeriodo();
  }

  return { init };
})();

window.AnalisePage = AnalisePage;
