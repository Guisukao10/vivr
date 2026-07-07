// cadastros.js - CRUD para categorias, responsáveis e mais
// Portado de controle-financeiro/Site_Controle/js/cadastros.js, adaptado para storage.js
// assíncrono (Supabase) e para diferenciar categorias de gasto ('despesa') vs ganho ('receita').
const CadastrosPage = (function () {
  function renderTabsAndSetupListeners() {
    const buttons = document.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.tab-content');

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        contents.forEach((c) => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
      });
    });
  }

  function renderItemList(containerId, items, entityType) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (!items.length) {
      container.textContent = 'Nenhum item cadastrado.';
      return;
    }

    const table = document.createElement('table');
    table.className = 'grid-table small-table';
    table.innerHTML = '<thead><tr><th>Nome</th><th>Ação</th></tr></thead>';
    const body = document.createElement('tbody');

    items.forEach((item) => {
      const tr = document.createElement('tr');
      const labelCol = document.createElement('td');
      labelCol.textContent = item.nome;
      const actionCol = document.createElement('td');

      const btnEdit = document.createElement('button');
      btnEdit.textContent = 'Editar';
      btnEdit.className = 'btn btn-small btn-info';
      btnEdit.onclick = () => editarItem(entityType, item);

      const btnRemove = document.createElement('button');
      btnRemove.textContent = 'Remover';
      btnRemove.className = 'btn btn-small btn-danger';
      btnRemove.onclick = () => removerItem(entityType, item.id, containerId);

      actionCol.appendChild(btnEdit);
      actionCol.appendChild(document.createTextNode(' '));
      actionCol.appendChild(btnRemove);

      tr.appendChild(labelCol);
      tr.appendChild(actionCol);
      body.appendChild(tr);
    });
    table.appendChild(body);
    container.appendChild(table);
  }

  function validarDuplicidade(array, nome) {
    return array.some((item) => item.nome.toLowerCase() === nome.toLowerCase());
  }

  function adicionarResponsavel() {
    const input = document.getElementById('nomeResponsavel');
    const nome = input.value.trim();
    if (!nome) { alert('Digite um nome.'); return; }

    const lista = StorageService.getResponsaveis();
    if (validarDuplicidade(lista, nome)) { alert('Este responsável já existe.'); return; }

    StorageService.addResponsavel({ nome }).then(() => {
      input.value = '';
      renderResponsaveis();
      UI.showMessage('Responsável adicionado com sucesso');
    });
  }

  function adicionarCategoriaGasto() {
    const input = document.getElementById('nomeCategoriaGasto');
    const nome = input.value.trim();
    if (!nome) { alert('Digite um nome.'); return; }

    const lista = StorageService.getCategorias().filter((c) => c.tipo === 'despesa');
    if (validarDuplicidade(lista, nome)) { alert('Esta categoria já existe.'); return; }

    StorageService.addCategoria({ nome, tipo: 'despesa' }).then(() => {
      input.value = '';
      renderCategoriaGastos();
      renderSelectSubcat();
      UI.showMessage('Categoria de gasto adicionada');
    });
  }

  function adicionarCategoriaGanho() {
    const input = document.getElementById('nomeCategoriaGanho');
    const nome = input.value.trim();
    if (!nome) { alert('Digite um nome.'); return; }

    const lista = StorageService.getCategorias().filter((c) => c.tipo === 'receita');
    if (validarDuplicidade(lista, nome)) { alert('Esta categoria já existe.'); return; }

    StorageService.addCategoria({ nome, tipo: 'receita' }).then(() => {
      input.value = '';
      renderCategoriaGanhos();
      renderSelectSubcat();
      UI.showMessage('Categoria de ganho adicionada');
    });
  }

  function adicionarSubcategoria() {
    const selectCat = document.getElementById('selectCategoriaSubcat');
    const categoriaId = selectCat.value;
    const input = document.getElementById('nomeSubcategoria');
    const nome = input.value.trim();

    if (!categoriaId) { alert('Selecione uma categoria.'); return; }
    if (!nome) { alert('Digite um nome.'); return; }

    const subs = StorageService.getSubcategorias();
    if (subs.some((s) => s.nome.toLowerCase() === nome.toLowerCase() && s.categoriaId === categoriaId)) {
      alert('Esta subcategoria já existe para esta categoria.');
      return;
    }

    StorageService.addSubcategoria({ categoriaId, nome }).then(() => {
      input.value = '';
      renderSubcategorias();
      UI.showMessage('Subcategoria adicionada');
    });
  }

  function adicionarTipoPagamento() {
    const input = document.getElementById('nomePagamento');
    const nome = input.value.trim();
    if (!nome) { alert('Digite um nome.'); return; }

    const lista = StorageService.getTiposPagamento();
    if (validarDuplicidade(lista, nome)) { alert('Este tipo já existe.'); return; }

    StorageService.addTipoPagamento({ nome }).then(() => {
      input.value = '';
      renderTipoPagamento();
      UI.showMessage('Tipo de pagamento adicionado');
    });
  }

  function adicionarStatus() {
    const input = document.getElementById('nomeStatus');
    const nome = input.value.trim();
    if (!nome) { alert('Digite um nome.'); return; }

    const lista = StorageService.getStatus();
    if (validarDuplicidade(lista, nome)) { alert('Este status já existe.'); return; }

    StorageService.addStatus({ nome }).then(() => {
      input.value = '';
      renderStatus();
      UI.showMessage('Status adicionado');
    });
  }

  function adicionarTipoRecebimento() {
    const input = document.getElementById('nomeRecebimento');
    const nome = input.value.trim();
    if (!nome) { alert('Digite um nome.'); return; }

    const lista = StorageService.getTiposPagamento();
    if (validarDuplicidade(lista, nome)) { alert('Este tipo já existe.'); return; }

    StorageService.addTipoPagamento({ nome }).then(() => {
      input.value = '';
      renderRecebimento();
      UI.showMessage('Tipo de recebimento adicionado');
    });
  }

  function removerItem(entityType, id, containerId) {
    if (!confirm('Confirmar remoção?')) return;

    let op;
    if (entityType === 'responsaveis') op = StorageService.removeResponsavel(id);
    else if (entityType === 'categorias' || entityType === 'categorias-gastos' || entityType === 'categorias-ganhos') op = StorageService.removeCategoria(id);
    else if (entityType === 'subcategorias') op = StorageService.removeSubcategoria(id);
    else if (entityType === 'pagamentos') op = StorageService.removeTipoPagamento(id);
    else if (entityType === 'status') op = StorageService.removeStatus(id);
    else return;

    op.then(() => {
      const lists = {
        responsaveis: StorageService.getResponsaveis(),
        'categorias-gastos': StorageService.getCategorias().filter((c) => c.tipo === 'despesa'),
        'categorias-ganhos': StorageService.getCategorias().filter((c) => c.tipo === 'receita'),
        subcategorias: StorageService.getSubcategorias(),
        pagamentos: StorageService.getTiposPagamento(),
        status: StorageService.getStatus(),
      };
      renderItemList(containerId, lists[entityType] || [], entityType);

      if (entityType === 'categorias-gastos' || entityType === 'categorias-ganhos') renderSelectSubcat();
      UI.showMessage('Item removido');
    });
  }

  function editarItem(entityType, item) {
    const novoNome = prompt(`Editar ${entityType}:`, item.nome);
    if (!novoNome || novoNome.trim() === item.nome) return;

    if (entityType === 'responsaveis') {
      StorageService.updateResponsavel(item.id, { nome: novoNome }).then(renderResponsaveis);
    } else if (entityType === 'categorias' || entityType === 'categorias-gastos' || entityType === 'categorias-ganhos') {
      StorageService.updateCategoria(item.id, { nome: novoNome }).then(() => {
        renderCategoriaGastos();
        renderCategoriaGanhos();
        renderSelectSubcat();
      });
    } else if (entityType === 'subcategorias') {
      StorageService.updateSubcategoria(item.id, { nome: novoNome }).then(renderSubcategorias);
    } else if (entityType === 'pagamentos') {
      StorageService.updateTipoPagamento(item.id, { nome: novoNome }).then(() => {
        renderTipoPagamento();
        renderRecebimento();
      });
    } else if (entityType === 'status') {
      StorageService.updateStatus(item.id, { nome: novoNome }).then(renderStatus);
    } else {
      return;
    }

    UI.showMessage('Item atualizado');
  }

  function renderSelectSubcat() {
    const select = document.getElementById('selectCategoriaSubcat');
    const cats = StorageService.getCategorias();
    select.innerHTML = '<option value="">Selecione uma categoria</option>';
    cats.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.nome + (cat.tipo ? ' (' + (cat.tipo === 'despesa' ? 'gasto' : 'ganho') + ')' : '');
      select.appendChild(opt);
    });
  }

  function renderResponsaveis() {
    renderItemList('listaResponsaveis', StorageService.getResponsaveis(), 'responsaveis');
  }

  function renderCategoriaGastos() {
    renderItemList('listaCategoriaGastos', StorageService.getCategorias().filter((c) => c.tipo === 'despesa'), 'categorias-gastos');
  }

  function renderCategoriaGanhos() {
    renderItemList('listaCategoriaGanhos', StorageService.getCategorias().filter((c) => c.tipo === 'receita'), 'categorias-ganhos');
  }

  function renderSubcategorias() {
    const subs = StorageService.getSubcategorias();
    const container = document.getElementById('listaSubcategorias');
    container.innerHTML = '';

    if (!subs.length) { container.textContent = 'Nenhuma subcategoria cadastrada.'; return; }

    const table = document.createElement('table');
    table.className = 'grid-table small-table';
    table.innerHTML = '<thead><tr><th>Categoria</th><th>Subcategoria</th><th>Ação</th></tr></thead>';
    const body = document.createElement('tbody');

    subs.forEach((sub) => {
      const tr = document.createElement('tr');
      const catCol = document.createElement('td');
      catCol.textContent = UI.mapCategoryName(sub.categoriaId);
      const subCol = document.createElement('td');
      subCol.textContent = sub.nome;
      const actionCol = document.createElement('td');

      const btnEdit = document.createElement('button');
      btnEdit.textContent = 'Editar';
      btnEdit.className = 'btn btn-small btn-info';
      btnEdit.onclick = () => editarItem('subcategorias', sub);

      const btnRemove = document.createElement('button');
      btnRemove.textContent = 'Remover';
      btnRemove.className = 'btn btn-small btn-danger';
      btnRemove.onclick = () => removerItem('subcategorias', sub.id, 'listaSubcategorias');

      actionCol.appendChild(btnEdit);
      actionCol.appendChild(document.createTextNode(' '));
      actionCol.appendChild(btnRemove);

      tr.appendChild(catCol);
      tr.appendChild(subCol);
      tr.appendChild(actionCol);
      body.appendChild(tr);
    });

    table.appendChild(body);
    container.appendChild(table);
  }

  function renderTipoPagamento() {
    renderItemList('listaTPagamento', StorageService.getTiposPagamento(), 'pagamentos');
  }

  function renderStatus() {
    renderItemList('listaStatus', StorageService.getStatus(), 'status');
  }

  function renderRecebimento() {
    renderItemList('listaRecebimento', StorageService.getTiposPagamento(), 'pagamentos');
  }

  function init() {
    renderTabsAndSetupListeners();
    renderResponsaveis();
    renderCategoriaGastos();
    renderCategoriaGanhos();
    renderSelectSubcat();
    renderSubcategorias();
    renderTipoPagamento();
    renderStatus();
    renderRecebimento();
  }

  return {
    init,
    adicionarResponsavel,
    adicionarCategoriaGasto,
    adicionarCategoriaGanho,
    adicionarSubcategoria,
    adicionarTipoPagamento,
    adicionarStatus,
    adicionarTipoRecebimento,
  };
})();

window.CadastrosPage = CadastrosPage;
