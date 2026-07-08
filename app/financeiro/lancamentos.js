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
      tblHead: document.querySelectorAll('#tabelaLancamentos th[data-sort]'),
      btnCancelarEdicao: document.getElementById('btnCancelarEdicao'),
      descSuggestions: document.getElementById('descSuggestions'),
      btnTipoDespesa: document.getElementById('btnTipoDespesa'),
      btnTipoReceita: document.getElementById('btnTipoReceita'),
      btnToggleDetalhes: document.getElementById('btnToggleDetalhes'),
      lcDetalhes: [document.getElementById('lcDetalhes'), document.getElementById('lcDetalhes2'), document.getElementById('lcDetalhes3')],
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

  // Autocomplete: sugere descrições já usadas na mesma categoria (mais frequentes primeiro),
  // e ao bater exato com uma descrição anterior, pré-preenche valor/pagamento pra agilizar.
  function atualizarSugestoesDescricao() {
    if (!dom.descSuggestions) return;
    const categoriaId = dom.categoria.value;
    const todos = StorageService.getLancamentos().filter((l) => l.categoriaId === categoriaId);
    const freq = {};
    todos.forEach((l) => { if (l.descricao) freq[l.descricao] = (freq[l.descricao] || 0) + 1; });
    const top = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 15);
    dom.descSuggestions.innerHTML = top.map((d) => `<option value="${d.replace(/"/g, '&quot;')}"></option>`).join('');
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
        data: dom.data.value || new Date().toISOString().split('T')[0],
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

  function renderTable(lancamentos) {
    dom.tabelaCorpo.innerHTML = '';
    lancamentos.forEach((item) => {
      const tr = document.createElement('tr');
      const cor = item.tipo === 'receita' ? '#15803D' : '#B91C1C';
      const sinal = item.tipo === 'receita' ? '+' : '-';
      tr.innerHTML = `
        <td>${Utils.formatDate(item.data)}</td>
        <td>${item.descricao}</td>
        <td>${UI.mapCategoryName(item.categoriaId)}</td>
        <td style="color:${cor};font-weight:700">${sinal} ${Utils.formatCurrency(item.valor)}</td>
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
    const total = lista.reduce((sum, item) => sum + Number(item.valor || 0), 0);
    dom.totalFiltrado.textContent = Utils.formatCurrency(total);
  }

  function updateTable() {
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
    dom.subcategoriaNova.value = '';
    dom.subcategoriaNova.disabled = true;
    dom.data.value = new Date().toISOString().substr(0, 10);
    dom.btnCancelarEdicao.style.display = 'none';
    setTipo('despesa');
    setDetalhesVisiveis(false);
  }

  function registerEvents() {
    dom.categoria.addEventListener('change', (e) => { atualizarSubcategorias(e.target.value); atualizarSugestoesDescricao(); });
    dom.descricao.addEventListener('change', preencherPorDescricaoConhecida);
    dom.descricao.addEventListener('input', sugerirCategoriaPorDescricao);

    dom.btnTipoDespesa.addEventListener('click', () => setTipo('despesa'));
    dom.btnTipoReceita.addEventListener('click', () => setTipo('receita'));

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
        const op = editingId ? StorageService.updateLancamento(editingId, data) : StorageService.addLancamento(data);
        return op.then(() => {
          UI.showMessage(editingId ? 'Lançamento atualizado com sucesso.' : 'Lançamento criado com sucesso.');
          resetForm();
          updateTable();
        });
      }).catch((err) => {
        UI.showMessage(err.message || 'Erro ao salvar lançamento');
      });
    });

    dom.btnCancelarEdicao.addEventListener('click', () => resetForm());

    dom.btnLimparFiltros.addEventListener('click', () => {
      dom.filtroTexto.value = '';
      dom.filtroCompetencia.value = '';
      dom.filtroResponsavel.value = '';
      dom.filtroTipo.value = '';
      dom.filtroCategoria.value = '';
      dom.filtroSubcategoria.value = '';
      dom.filtroStatus.value = '';
      dom.filtroFixoVariavel.value = '';
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
      updateTable();
    } catch (error) {
      console.error('Erro inicializando página de lançamentos', error);
      UI.showMessage('Erro ao inicializar lançamentos');
    }
  }

  return { init };
})();

window.LancamentosPage = LancamentosPage;
