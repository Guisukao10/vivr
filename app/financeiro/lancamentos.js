// lancamentos.js - lógica de lançamentos
// Portado de controle-financeiro/Site_Controle/js/lancamentos.js. O HTML original não tinha
// o formulário/tabela implementados (só um <div id="lancamentoForm"> vazio) — o markup foi
// construído do zero em lancamentos.html, mantendo os mesmos ids referenciados aqui.
// Adaptado para storage.js assíncrono (Supabase).
const LancamentosPage = (function () {
  const state = {
    sortField: 'data',
    sortDir: 'desc',
    editingId: null,
    // Tabela começa oculta: com 600+ lançamentos, despejar tudo na tela não ajuda
    // ninguém. Filtrou → aparece filtrado. "Ver tudo" mostra sem critério.
    tabelaVisivel: false,
  };

  var dom = {};

  function cacheDom(){
    dom = {
      form: document.getElementById('lancamentoForm'),
      data: document.getElementById('data'),
      tipo: document.getElementById('tipo'),
      responsavel: document.getElementById('responsavel'),
      categoria: document.getElementById('categoria'),
      subcategoria: document.getElementById('subcategoria'),
      subcategoriaNova: document.getElementById('subcategoriaNova'),
      descricao: document.getElementById('descricao'),
      valor: document.getElementById('valor'),
      parcelas: document.getElementById('parcelas'),
      obs: document.getElementById('obs'),
      status: document.getElementById('status'),
      recorrente: document.getElementById('recorrente'),
      fixoVariavel: document.getElementById('fixoVariavel'),
      pagamento: document.getElementById('pagamento'),
      contadorRegistros: document.getElementById('contadorRegistros'),
      totalFiltrado: document.getElementById('totalFiltrado'),
      tabelaCorpo: document.querySelector('#tabelaLancamentos tbody'),
      filtroTexto: document.getElementById('filtroTexto'),
      filtroCompetencia: document.getElementById('filtroCompetencia'),
      filtroResponsavel: document.getElementById('filtroResponsavel'),
      filtroTipo: document.getElementById('filtroTipo'),
      filtroCategoria: document.getElementById('filtroCategoria'),
      filtroSubcategoria: document.getElementById('filtroSubcategoria'),
      filtroStatus: document.getElementById('filtroStatus'),
      filtroFixoVariavel: document.getElementById('filtroFixoVariavel'),
      btnLimparFiltros: document.getElementById('btnLimparFiltros'),
      btnVerTudo: document.getElementById('btnVerTudo'),
      tblHead: document.querySelectorAll('#tabelaLancamentos th[data-sort]'),
      btnCancelarEdicao: document.getElementById('btnCancelarEdicao'),
      descSuggestions: document.getElementById('descSuggestions'),
      btnTipoDespesa: document.getElementById('btnTipoDespesa'),
      btnTipoReceita: document.getElementById('btnTipoReceita'),
      btnToggleDetalhes: document.getElementById('btnToggleDetalhes'),
      lcDetalhes: [document.getElementById('lcDetalhes'), document.getElementById('lcDetalhes2')],
      btnToggleMaisFiltros: document.getElementById('btnToggleMaisFiltros'),
      maisFiltros: document.getElementById('maisFiltros'),
    };
  }

  // Categoria filtrada pelo tipo escolhido (Gastei/Recebi) — menos chance de escolher
  // errado, e a lista fica menor (só o que faz sentido pro tipo atual).
  function atualizarCategoriaPorTipo() {
    const tipo = dom.tipo.value;
    const categorias = StorageService.getCategorias().filter((c) => c.tipo === tipo);
    preencherSelect(dom.categoria, categorias, (x) => x.nome, (x) => x.id);
    atualizarSubcategorias(dom.categoria.value);
    atualizarSugestoesDescricao();
  }

  function setTipo(tipo) {
    dom.tipo.value = tipo;
    dom.btnTipoDespesa.classList.toggle('on', tipo === 'despesa');
    dom.btnTipoReceita.classList.toggle('on', tipo === 'receita');
    atualizarCategoriaPorTipo();
  }

  // Enquanto a pessoa digita a descrição, tenta adivinhar a categoria — ela só precisa
  // confirmar (ou trocar), não escolher do zero toda vez.
  function sugerirCategoriaPorDescricao() {
    const texto = dom.descricao.value.trim();
    if (!texto || texto.length < 3) return;
    const categorias = StorageService.getCategorias().filter((c) => c.tipo === dom.tipo.value);
    const catId = Utils.sugerirCategoriaPorTexto(texto, categorias);
    if (catId) dom.categoria.value = catId;
  }

  // Autocomplete com TODAS as descrições já usadas (qualquer categoria, sem limite),
  // como os dropdowns da planilha: as da categoria atual vêm primeiro, depois as demais
  // por frequência. Descrição nova entra sozinha na lista assim que o lançamento salva,
  // porque a lista nasce do próprio histórico.
  function atualizarSugestoesDescricao() {
    if (!dom.descSuggestions) return;
    const categoriaId = dom.categoria.value;
    const freq = {};
    StorageService.getLancamentos().forEach((l) => {
      const d = (l.descricao || '').trim();
      if (!d) return;
      if (!freq[d]) freq[d] = { count: 0, daCategoria: false };
      freq[d].count += 1;
      if (l.categoriaId === categoriaId) freq[d].daCategoria = true;
    });
    const ordenadas = Object.keys(freq).sort((a, b) => {
      if (freq[a].daCategoria !== freq[b].daCategoria) return freq[a].daCategoria ? -1 : 1;
      return freq[b].count - freq[a].count;
    });
    dom.descSuggestions.innerHTML = ordenadas.map((d) => `<option value="${d.replace(/"/g, '&quot;')}"></option>`).join('');
  }

  function preencherPorDescricaoConhecida() {
    const categoriaId = dom.categoria.value;
    const desc = dom.descricao.value.trim();
    if (!desc || dom.valor.value) return; // não sobrescreve valor já digitado
    const match = StorageService.getLancamentos()
      .filter((l) => l.categoriaId === categoriaId && l.descricao === desc)
      .sort((a, b) => new Date(b.data) - new Date(a.data))[0];
    if (!match) return;
    dom.valor.value = match.valor;
    if (match.pagamentoId) dom.pagamento.value = match.pagamentoId;
    if (match.subcategoriaId) { dom.subcategoria.value = match.subcategoriaId; }
    UI.showMessage('Preenchido com base no último lançamento parecido');
  }

  function preencherSelect(element, items, textFn, valueFn, withAllOption = false, selectedValue = '') {
    element.innerHTML = '';
    if (withAllOption) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Todos';
      element.appendChild(option);
    }
    items.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = valueFn ? valueFn(item) : item.id;
      opt.textContent = textFn(item);
      if (selectedValue && opt.value === selectedValue) opt.selected = true;
      element.appendChild(opt);
    });
  }

  function carregarDadosBasicos() {
    preencherSelect(dom.responsavel, StorageService.getResponsaveis(), (x) => x.nome, (x) => x.id);
    atualizarCategoriaPorTipo();
    preencherSelect(dom.status, StorageService.getStatus(), (x) => x.nome, (x) => x.id);
    preencherSelect(dom.pagamento, StorageService.getTiposPagamento(), (x) => x.nome, (x) => x.id);

    preencherSelect(dom.filtroResponsavel, StorageService.getResponsaveis(), (x) => x.nome, (x) => x.id, true);
    preencherSelect(dom.filtroCategoria, StorageService.getCategorias(), (x) => x.nome, (x) => x.id, true);
    preencherSelect(dom.filtroStatus, StorageService.getStatus(), (x) => x.nome, (x) => x.id, true);

    atualizarFiltroSubcategorias();
  }

  function atualizarSubcategorias(categoriaId = '') {
    let subs = StorageService.getSubcategorias();
    if (categoriaId) subs = subs.filter((sub) => sub.categoriaId === categoriaId);
    const items = [...subs];
    items.push({ id: 'novo', nome: '+ Criar nova subcategoria' });
    preencherSelect(dom.subcategoria, items, (x) => x.nome, (x) => x.id);
    dom.subcategoriaNova.value = '';
    dom.subcategoriaNova.disabled = true;
  }

  function atualizarFiltroSubcategorias() {
    const subs = StorageService.getSubcategorias();
    preencherSelect(dom.filtroSubcategoria, subs, (x) => x.nome, (x) => x.id, true);
  }

  // Retorna uma Promise que resolve com o payload pronto pra salvar
  // (cria a subcategoria nova primeiro, se for o caso).
  function getFormDataAsync() {
    const categoriaId = dom.categoria.value;
    let subcategoriaId = dom.subcategoria.value;

    const rawValor = Number(dom.valor.value);
    if (Number.isNaN(rawValor) || rawValor <= 0) return Promise.reject(new Error('Valor deve ser maior que zero'));

    function montarPayload(subId){
      return {
        data: dom.data.value || Utils.hojeISO(),
        tipo: dom.tipo.value,
        responsavelId: dom.responsavel.value || null,
        categoriaId,
        subcategoriaId: subId || null,
        descricao: dom.descricao.value.trim(),
        valor: rawValor,
        obs: dom.obs.value.trim(),
        statusId: dom.status.value || null,
        recurring: dom.recorrente.value === 'sim',
        fixoVariavel: dom.fixoVariavel.value,
        pagamentoId: dom.pagamento.value || null,
      };
    }

    if (subcategoriaId === 'novo') {
      const nomeSub = dom.subcategoriaNova.value.trim();
      // Subcategoria é sempre opcional — "novo" pode ter virado a opção selecionada
      // sozinho (só existe "Criar nova" pra essa categoria) sem a pessoa ter aberto
      // "Mais detalhes" pra ver isso. Sem nome digitado, segue sem subcategoria.
      if (!nomeSub) return Promise.resolve(montarPayload(null));
      return StorageService.addSubcategoria({ categoriaId, nome: nomeSub }).then((nova) => {
        atualizarSubcategorias(categoriaId);
        atualizarFiltroSubcategorias();
        dom.subcategoria.value = nova.id;
        UI.showMessage('Subcategoria criada e usada no lançamento');
        return montarPayload(nova.id);
      });
    }

    return Promise.resolve(montarPayload(subcategoriaId));
  }

  // Mapas id→nome pra tabela ler como a planilha (Responsável / Pagamento por extenso)
  function nomePorId(lista, id) {
    const found = (lista || []).find((x) => x.id === id);
    return found ? found.nome : '';
  }

  // Soma meses a uma data ISO mantendo o dia (dia 31 em mês curto vira o último dia).
  function addMonthsIso(iso, n) {
    const p = iso.split('-').map(Number);
    const alvo = new Date(p[0], p[1] - 1 + n, 1);
    const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
    const dia = Math.min(p[2], ultimoDia);
    return alvo.getFullYear() + '-' + String(alvo.getMonth() + 1).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
  }

  /* ── Contas do mês ──
     Detecta despesas/receitas que se repetem todo mês (mesma descrição+valor, no máximo
     uma por mês, em 3+ dos últimos 4 meses — ou marcadas como recorrentes). Cada sugestão
     carrega o histórico que a gerou, pra pessoa conferir de onde a frequência veio. */
  function detectarRecorrentes() {
    const hoje = new Date();
    const mesAtual = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
    const ultimos4 = [];
    for (let i = 1; i <= 4; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      ultimos4.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }

    const grupos = {};
    StorageService.getLancamentos().forEach((l) => {
      if (!l.descricao || !l.data) return;
      const key = [l.tipo, l.descricao, Number(l.valor).toFixed(2), l.categoriaId || ''].join('|');
      (grupos[key] = grupos[key] || []).push(l);
    });

    const recorrentes = [];
    Object.values(grupos).forEach((lista) => {
      const mesesDistintos = {};
      let temNoMesAtual = false;
      let recorrenteExplicito = false;
      lista.forEach((l) => {
        const m = l.data.slice(0, 7);
        mesesDistintos[m] = (mesesDistintos[m] || 0) + 1;
        if (m === mesAtual) temNoMesAtual = true;
        if (l.recurring) recorrenteExplicito = true;
      });
      const nosUltimos4 = ultimos4.filter((m) => mesesDistintos[m]).length;
      const umaPorMes = Object.values(mesesDistintos).every((c) => c === 1);
      // Fixas de verdade: uma por mês. Café de R$ 2,50 cinco vezes por semana não entra.
      if (!recorrenteExplicito && !(nosUltimos4 >= 3 && umaPorMes)) return;
      const historico = lista.slice().sort((a, b) => b.data.localeCompare(a.data));
      const maisRecente = historico[0];
      // Precisa ter ocorrido recentemente (não sugerir conta encerrada há meses)
      if (ultimos4.indexOf(maisRecente.data.slice(0, 7)) === -1 &&
          maisRecente.data.slice(0, 7) !== mesAtual && !recorrenteExplicito) return;

      const dias = lista.map((l) => parseInt(l.data.slice(8, 10), 10)).sort((a, b) => a - b);
      const diaTipico = dias[Math.floor(dias.length / 2)];
      recorrentes.push({ modelo: maisRecente, diaTipico, historico, nosUltimos4, recorrenteExplicito, jaNoMesAtual: temNoMesAtual });
    });
    return recorrentes.sort((a, b) => a.diaTipico - b.diaTipico);
  }

  function detectarContasDoMes() {
    return detectarRecorrentes().filter((c) => !c.jaNoMesAtual);
  }

  function lancarConta(cand) {
    const hoje = new Date();
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const dia = Math.min(cand.diaTipico, ultimoDia);
    const m = cand.modelo;
    return StorageService.addLancamento({
      data: hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(dia).padStart(2, '0'),
      tipo: m.tipo,
      responsavelId: m.responsavelId || null,
      categoriaId: m.categoriaId || null,
      subcategoriaId: m.subcategoriaId || null,
      descricao: m.descricao,
      valor: Number(m.valor),
      obs: m.obs || m.observacao || '',
      statusId: m.statusId || null,
      recurring: true, // lançou pelo painel = é fixa; próximo mês nem precisa detectar
      fixoVariavel: 'fixo',
      pagamentoId: m.pagamentoId || null,
    });
  }

  // "Por quê?": os lançamentos que fizeram o sistema entender a frequência —
  // a sugestão deixa de ser caixa-preta e vira algo que dá pra conferir e confiar.
  function evidenciaHtml(c) {
    const datas = c.historico.slice(0, 8).map((l) => Utils.formatDate(l.data));
    const mais = c.historico.length > 8 ? ' e mais ' + (c.historico.length - 8) : '';
    const criterio = c.recorrenteExplicito
      ? 'Você marcou esta conta como <strong>recorrente</strong>.'
      : 'Apareceu em <strong>' + c.nosUltimos4 + ' dos últimos 4 meses</strong>, sempre uma vez por mês.';
    return criterio +
      '<div class="cm-hist-datas">Lançamentos que geraram a sugestão: ' + datas.join(' · ') + mais +
      ' — sempre ' + Utils.formatCurrency(c.modelo.valor) +
      (c.modelo.categoriaId ? ' em ' + UI.mapCategoryName(c.modelo.categoriaId) : '') + '.</div>';
  }

  function renderContasDoMes() {
    const box = document.getElementById('contasMesPanel');
    if (!box) return;
    const todas = detectarRecorrentes();
    const cands = todas.filter((c) => !c.jaNoMesAtual);

    if (!todas.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = '';

    // Mês em dia: em vez de sumir, confirma — a pessoa sabe que o vivr está de olho.
    if (!cands.length) {
      box.classList.add('ok');
      box.innerHTML = '<div class="cm-header"><strong>✅ Contas fixas do mês em dia</strong>' +
        '<span class="cm-total">' + todas.length + ' conta(s) recorrente(s) conhecida(s), todas já lançadas este mês</span></div>';
      return;
    }
    box.classList.remove('ok');

    const total = cands.reduce((s, c) => s + Number(c.modelo.valor), 0);
    const responsaveis = StorageService.getResponsaveis();
    box.innerHTML =
      '<div class="cm-header"><strong>🔁 Contas do mês ainda não lançadas</strong>' +
      '<span class="cm-total">' + cands.length + ' conta(s) · ' + Utils.formatCurrency(total) + '</span>' +
      '<button class="btn btn-small btn-primary" id="btnLancarTodas">Lançar todas</button></div>' +
      '<p class="cm-sub">Sugestões vindas do seu histórico. Clique em <strong>por quê?</strong> pra ver os lançamentos que geraram cada uma.</p>' +
      '<div style="overflow-x:auto"><table class="grid-table cm-table"><thead><tr>' +
      '<th>Dia</th><th>Descrição</th><th>Categoria</th><th>Responsável</th><th>Valor</th><th>Detecção</th><th></th>' +
      '</tr></thead><tbody>' +
      cands.map((c, i) =>
        '<tr>' +
          '<td class="cm-dia">dia ' + c.diaTipico + '</td>' +
          '<td class="cm-desc">' + c.modelo.descricao + (c.modelo.tipo === 'receita' ? ' <span style="color:#15803D">(ganho)</span>' : '') + '</td>' +
          '<td class="cm-cat">' + UI.mapCategoryName(c.modelo.categoriaId) + '</td>' +
          '<td class="cm-cat">' + nomePorId(responsaveis, c.modelo.responsavelId) + '</td>' +
          '<td class="cm-val">' + Utils.formatCurrency(c.modelo.valor) + '</td>' +
          '<td><button type="button" class="cm-why" data-cm-why="' + i + '">' +
            (c.recorrenteExplicito ? '🔁 recorrente' : '📅 ' + c.nosUltimos4 + ' de 4 meses') + ' · por quê?</button></td>' +
          '<td><button class="btn btn-small" data-cm-idx="' + i + '">Lançar</button></td>' +
        '</tr>' +
        '<tr class="cm-hist" data-cm-hist="' + i + '" style="display:none"><td colspan="7">' + evidenciaHtml(c) + '</td></tr>'
      ).join('') +
      '</tbody></table></div>';

    box.querySelectorAll('[data-cm-why]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = box.querySelector('[data-cm-hist="' + btn.dataset.cmWhy + '"]');
        if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
      });
    });
    box.querySelectorAll('[data-cm-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.disabled = true;
        lancarConta(cands[btn.dataset.cmIdx]).then(() => {
          UI.showMessage('Conta lançada.');
          renderContasDoMes();
          updateTable();
        });
      });
    });
    const btnTodas = document.getElementById('btnLancarTodas');
    if (btnTodas) btnTodas.addEventListener('click', () => {
      btnTodas.disabled = true;
      Promise.all(cands.map(lancarConta)).then(() => {
        UI.showMessage(cands.length + ' contas lançadas.');
        renderContasDoMes();
        updateTable();
      });
    });
  }

  // Prévia do parcelamento em tempo real: antes de salvar, a pessoa vê exatamente
  // quantas parcelas, o total e até quando vão — sem surpresa depois do clique.
  function atualizarPreviewParcelas() {
    const box = document.getElementById('parcelasPreview');
    const btnSalvar = dom.form.querySelector('button[type="submit"]');
    if (!box) return;
    const n = parseInt(dom.parcelas.value, 10) || 1;
    const v = Number(dom.valor.value);
    if (state.editingId || n <= 1 || !(v > 0)) {
      box.style.display = 'none';
      box.innerHTML = '';
      if (btnSalvar) btnSalvar.textContent = 'Salvar lançamento';
      return;
    }
    const base = dom.data.value || Utils.hojeISO();
    const ultima = addMonthsIso(base, n - 1);
    box.style.display = '';
    box.innerHTML = '💳 <strong>' + n + '× de ' + Utils.formatCurrency(v) + '</strong> = ' +
      Utils.formatCurrency(v * n) + ' no total · uma parcela por mês, de ' +
      Utils.formatDate(base) + ' até ' + Utils.formatDate(ultima) +
      ', numeradas na observação (Parcela 1/' + n + ', 2/' + n + '...).';
    if (btnSalvar) btnSalvar.textContent = 'Salvar ' + n + ' parcelas';
  }

  function renderTable(lancamentos) {
    dom.tabelaCorpo.innerHTML = '';
    const responsaveis = StorageService.getResponsaveis();
    const pagamentos = StorageService.getTiposPagamento();
    lancamentos.forEach((item) => {
      const tr = document.createElement('tr');
      tr.dataset.rowId = item.id;
      tr.title = 'Duplo clique para editar';
      const cor = item.tipo === 'receita' ? '#15803D' : '#B91C1C';
      const sinal = item.tipo === 'receita' ? '+' : '-';
      const obs = item.obs || item.observacao || '';
      tr.innerHTML = `
        <td style="white-space:nowrap">${Utils.formatDate(item.data)}</td>
        <td>${nomePorId(responsaveis, item.responsavelId)}</td>
        <td>${UI.mapCategoryName(item.categoriaId)}</td>
        <td>${nomePorId(pagamentos, item.pagamentoId)}</td>
        <td>${item.descricao}</td>
        <td style="color:${cor};font-weight:700;white-space:nowrap">${sinal} ${Utils.formatCurrency(item.valor)}</td>
        <td style="color:#888;font-size:.78rem">${obs}</td>
        <td class="action-cell">
          <button class="btn btn-small btn-info" data-action="editar" data-id="${item.id}">Editar</button>
          <button class="btn btn-small btn-danger" data-action="excluir" data-id="${item.id}">Excluir</button>
          <button class="btn btn-small" data-action="duplicar" data-id="${item.id}">Duplicar</button>
        </td>
      `;
      dom.tabelaCorpo.appendChild(tr);
    });
  }

  function getFiltros() {
    return {
      texto: dom.filtroTexto.value.trim().toLowerCase(),
      competencia: dom.filtroCompetencia.value,
      responsavelId: dom.filtroResponsavel.value,
      tipo: dom.filtroTipo.value,
      categoriaId: dom.filtroCategoria.value,
      subcategoriaId: dom.filtroSubcategoria.value,
      statusId: dom.filtroStatus.value,
      fixoVariavel: dom.filtroFixoVariavel.value,
    };
  }

  function filtrarLancamentos(lista) {
    const filtro = getFiltros();
    return lista.filter((item) => {
      if (filtro.texto && !item.descricao.toLowerCase().includes(filtro.texto)) return false;
      if (filtro.competencia && item.data.slice(0, 7) !== filtro.competencia) return false;
      if (filtro.responsavelId && item.responsavelId !== filtro.responsavelId) return false;
      if (filtro.tipo && item.tipo !== filtro.tipo) return false;
      if (filtro.categoriaId && item.categoriaId !== filtro.categoriaId) return false;
      if (filtro.subcategoriaId && item.subcategoriaId !== filtro.subcategoriaId) return false;
      if (filtro.statusId && item.statusId !== filtro.statusId) return false;
      if (filtro.fixoVariavel && item.fixoVariavel !== filtro.fixoVariavel) return false;
      return true;
    });
  }

  function ordenarLancamentos(lista) {
    if (state.sortField === 'valor') {
      return [...lista].sort((a, b) => {
        const diff = (a.valor || 0) - (b.valor || 0);
        return state.sortDir === 'asc' ? diff : -diff;
      });
    }
    return Utils.sortByDate(lista, state.sortField, state.sortDir);
  }

  function atualizarResumo(lista) {
    dom.contadorRegistros.textContent = lista.length;
    let gastos = 0, ganhos = 0;
    lista.forEach((item) => {
      const v = Number(item.valor || 0);
      if (item.tipo === 'receita') ganhos += v; else gastos += v;
    });
    const partes = [];
    if (gastos > 0) partes.push(`Gastos ${Utils.formatCurrency(gastos)}`);
    if (ganhos > 0) partes.push(`Ganhos ${Utils.formatCurrency(ganhos)}`);
    if (gastos > 0 && ganhos > 0) partes.push(`Saldo ${Utils.formatCurrency(ganhos - gastos)}`);
    dom.totalFiltrado.textContent = partes.length ? partes.join(' · ') : Utils.formatCurrency(0);
  }

  function temFiltroAtivo() {
    const f = getFiltros();
    return Object.values(f).some((v) => v !== '' && v !== null && v !== undefined);
  }

  function updateTable() {
    if (!temFiltroAtivo() && !state.tabelaVisivel) {
      dom.tabelaCorpo.innerHTML =
        '<tr><td colspan="8" style="text-align:center;padding:28px;color:#aaa;font-size:.85rem">' +
        '🔎 Use os filtros acima para ver seus lançamentos — ou clique em <strong>Ver tudo</strong>.</td></tr>';
      dom.contadorRegistros.textContent = StorageService.getLancamentos().length;
      dom.totalFiltrado.textContent = 'filtre para ver os totais';
      return;
    }
    let dados = StorageService.getLancamentos();
    dados = filtrarLancamentos(dados);
    dados = ordenarLancamentos(dados);
    renderTable(dados);
    atualizarResumo(dados);
  }

  function setEditState(item) {
    state.editingId = item.id;
    dom.data.value = item.data;
    setTipo(item.tipo);
    dom.responsavel.value = item.responsavelId || '';
    dom.categoria.value = item.categoriaId || '';
    atualizarSubcategorias(item.categoriaId);
    dom.subcategoria.value = item.subcategoriaId || 'novo';
    dom.descricao.value = item.descricao;
    dom.valor.value = item.valor;
    dom.obs.value = item.obs || '';
    dom.status.value = item.statusId || '';
    dom.recorrente.value = item.recurring ? 'sim' : 'nao';
    dom.fixoVariavel.value = item.fixoVariavel || 'variavel';
    dom.pagamento.value = item.pagamentoId || '';
    dom.parcelas.value = ''; // edição altera só este lançamento; parcelas não se aplicam
    atualizarPreviewParcelas();
    dom.btnCancelarEdicao.style.display = '';
    setDetalhesVisiveis(true); // editar já mostra tudo — evita esconder dado que a pessoa já tinha preenchido
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setDetalhesVisiveis(visivel) {
    dom.lcDetalhes.forEach((el) => { if (el) el.style.display = visivel ? '' : 'none'; });
    if (dom.btnToggleDetalhes) dom.btnToggleDetalhes.textContent = visivel ? '− Menos detalhes' : '+ Mais detalhes (opcional)';
  }

  function resetForm() {
    state.editingId = null;
    dom.form.reset();
    dom.parcelas.value = '';
    dom.subcategoriaNova.value = '';
    dom.subcategoriaNova.disabled = true;
    dom.data.value = Utils.hojeISO();
    dom.btnCancelarEdicao.style.display = 'none';
    setTipo('despesa');
    setDetalhesVisiveis(false);
    atualizarPreviewParcelas();
  }

  function registerEvents() {
    dom.categoria.addEventListener('change', (e) => { atualizarSubcategorias(e.target.value); atualizarSugestoesDescricao(); });
    dom.descricao.addEventListener('change', preencherPorDescricaoConhecida);
    dom.descricao.addEventListener('input', sugerirCategoriaPorDescricao);

    dom.btnTipoDespesa.addEventListener('click', () => setTipo('despesa'));
    dom.btnTipoReceita.addEventListener('click', () => setTipo('receita'));

    [dom.parcelas, dom.valor, dom.data].forEach((el) => el.addEventListener('input', atualizarPreviewParcelas));

    dom.btnToggleDetalhes.addEventListener('click', () => {
      const visivel = dom.lcDetalhes[0].style.display !== 'none';
      setDetalhesVisiveis(!visivel);
    });
    dom.btnToggleMaisFiltros.addEventListener('click', () => {
      const visivel = dom.maisFiltros.style.display !== 'none';
      dom.maisFiltros.style.display = visivel ? 'none' : '';
      dom.btnToggleMaisFiltros.textContent = visivel ? '+ Mais filtros' : '− Menos filtros';
    });

    dom.subcategoria.addEventListener('change', (e) => {
      const isNovo = e.target.value === 'novo';
      dom.subcategoriaNova.disabled = !isNovo;
      if (!isNovo) dom.subcategoriaNova.value = '';
    });

    dom.form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      getFormDataAsync().then((data) => {
        const editingId = state.editingId;
        const nParcelas = editingId ? 1 : Math.max(1, parseInt(dom.parcelas.value, 10) || 1);

        // Aviso de duplicado: mesma data+descrição+valor+tipo já existe? Pede uma
        // segunda confirmação (salvar de novo) em vez de bloquear — duplicata
        // legítima existe (duas academias no mesmo dia), acidental também.
        if (!editingId && nParcelas === 1) {
          const assinatura = [data.data, data.descricao, Number(data.valor).toFixed(2), data.tipo].join('|');
          const jaExiste = StorageService.getLancamentos().some((l) =>
            l.data === data.data && l.descricao === data.descricao &&
            Number(l.valor).toFixed(2) === Number(data.valor).toFixed(2) && l.tipo === data.tipo);
          if (jaExiste && state.confirmandoDuplicado !== assinatura) {
            state.confirmandoDuplicado = assinatura;
            UI.showMessage('⚠️ Já existe um lançamento igual nesta data. Clique em Salvar de novo se for proposital.');
            return;
          }
          state.confirmandoDuplicado = null;
        }

        if (nParcelas > 1) {
          // Compra parcelada: o Valor é o de CADA parcela; gera uma por mês a partir da
          // data escolhida, numerada na observação — chega de controlar "5 de 27" na mão.
          const obsBase = data.obs ? data.obs + ' · ' : '';
          const ops = [];
          for (let i = 0; i < nParcelas; i++) {
            ops.push(StorageService.addLancamento(Object.assign({}, data, {
              data: addMonthsIso(data.data, i),
              obs: obsBase + 'Parcela ' + (i + 1) + '/' + nParcelas,
            })));
          }
          return Promise.all(ops).then(() => {
            const ultima = addMonthsIso(data.data, nParcelas - 1);
            UI.showMessage(nParcelas + ' parcelas lançadas até ' + Utils.formatDate(ultima) + '.');
            resetForm();
            updateTable();
            renderContasDoMes();
          });
        }

        const op = editingId ? StorageService.updateLancamento(editingId, data) : StorageService.addLancamento(data);
        return op.then(() => {
          UI.showMessage(editingId ? 'Lançamento atualizado com sucesso.' : 'Lançamento criado com sucesso.');
          resetForm();
          updateTable();
          renderContasDoMes();
        });
      }).catch((err) => {
        UI.showMessage(err.message || 'Erro ao salvar lançamento');
      });
    });

    dom.btnCancelarEdicao.addEventListener('click', () => resetForm());

    dom.btnVerTudo.addEventListener('click', () => {
      state.tabelaVisivel = true;
      updateTable();
    });

    dom.btnLimparFiltros.addEventListener('click', () => {
      dom.filtroTexto.value = '';
      dom.filtroCompetencia.value = '';
      dom.filtroResponsavel.value = '';
      dom.filtroTipo.value = '';
      dom.filtroCategoria.value = '';
      dom.filtroSubcategoria.value = '';
      dom.filtroStatus.value = '';
      dom.filtroFixoVariavel.value = '';
      state.tabelaVisivel = false; // volta ao estado recolhido
      updateTable();
    });

    [
      dom.filtroTexto, dom.filtroCompetencia, dom.filtroResponsavel, dom.filtroTipo,
      dom.filtroCategoria, dom.filtroSubcategoria, dom.filtroStatus, dom.filtroFixoVariavel,
    ].forEach((el) => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => updateTable()));

    dom.tabelaCorpo.addEventListener('click', (ev) => {
      const button = ev.target.closest('button');
      if (!button) return;
      const action = button.dataset.action;
      const id = button.dataset.id;
      const lancamento = StorageService.getLancamentos().find((item) => item.id === id);
      if (!lancamento) return;

      if (action === 'editar') {
        setEditState(lancamento);
        UI.showMessage('Modo edição ativado para o lançamento selecionado');
      } else if (action === 'excluir') {
        if (confirm('Confirmar exclusão deste lançamento?')) {
          StorageService.removeLancamento(id).then(() => {
            updateTable();
            UI.showMessage('Lançamento excluído.');
          });
        }
      } else if (action === 'duplicar') {
        const clone = Object.assign({}, lancamento, { id: undefined });
        StorageService.addLancamento(clone).then(() => {
          updateTable();
          UI.showMessage('Lançamento duplicado.');
        });
      }
    });

    // Duplo clique em qualquer lugar da linha = editar (atalho da planilha)
    dom.tabelaCorpo.addEventListener('dblclick', (ev) => {
      if (ev.target.closest('button')) return;
      const tr = ev.target.closest('tr[data-row-id]');
      if (!tr) return;
      const lancamento = StorageService.getLancamentos().find((item) => item.id === tr.dataset.rowId);
      if (!lancamento) return;
      setEditState(lancamento);
      UI.showMessage('Modo edição ativado para o lançamento selecionado');
    });

    dom.tblHead.forEach((th) => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (!field) return;
        if (state.sortField === field) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortField = field;
          state.sortDir = 'asc';
        }
        updateTable();
      });
    });
  }

  function init() {
    try {
      cacheDom();
      carregarDadosBasicos();
      resetForm();
      registerEvents();
      atualizarSugestoesDescricao();
      // ?buscar=... (vindo do "A revisar" da Análise) já abre a tabela filtrada
      const buscar = new URLSearchParams(window.location.search).get('buscar');
      if (buscar) dom.filtroTexto.value = buscar;
      updateTable();
      renderContasDoMes();
    } catch (error) {
      console.error('Erro inicializando página de lançamentos', error);
      UI.showMessage('Erro ao inicializar lançamentos');
    }
  }

  return { init };
})();

window.LancamentosPage = LancamentosPage;
