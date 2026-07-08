(function(){
'use strict';

/* ── Estado do treino avançado ── */
var tState = {
  subTab: 'registro',
  exercicios: [],
  rotinas: [],
  rotinaEditando: null,   // {id?, nome, objetivo, dias_semana:[], itens:[{exercicio_id, series, reps_alvo, carga_sugerida_kg, descanso_seg}]}
  execucaoAtual: null,    // {rotina, execucao_id, series:{ [exercicio_id]: [{reps_feitas,carga_kg,concluida}] }}
  grants: []
};

var DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
var GRUPOS = ['peito','costas','perna','ombro','biceps','triceps','core','cardio'];
var GRUPO_LBL = {peito:'Peito',costas:'Costas',perna:'Perna',ombro:'Ombro',biceps:'Bíceps',triceps:'Tríceps',core:'Core',cardio:'Cardio'};

function tEsc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ── Carga inicial ── */
function loadTreinoAvancado(){
  return Promise.all([
    db.from('exercicios').select('*'),
    db.from('rotinas').eq('ativo','true').order('created_at',{ascending:true}).select('*')
  ]).then(function(res){
    tState.exercicios = res[0]||[];
    tState.rotinas = res[1]||[];
  });
}

function rotinaExercicios(rotinaId){
  return db.from('rotina_exercicios').eq('rotina_id',rotinaId).order('ordem',{ascending:true}).select('*');
}

/* ── Sub-nav dentro de Treino ── */
function renderTreinoSubNav(){
  var tabs = [
    {id:'registro', lbl:'Registro rápido'},
    {id:'rotinas', lbl:'Minhas rotinas'},
    {id:'executar', lbl:'Executar treino'},
    {id:'compartilhar', lbl:'Compartilhar com personal'}
  ];
  return '<div class="tsub-nav">'+tabs.map(function(t){
    return '<button class="tsub-btn'+(t.id===tState.subTab?' on':'')+'" onclick="setTreinoSubTab(\''+t.id+'\')">'+t.lbl+'</button>';
  }).join('')+'</div>';
}

function setTreinoSubTab(id){
  tState.subTab = id;
  renderTreinoBody();
}

/* Ponto de entrada chamado no lugar do antigo renderTreino() simples.
   window.renderTreinoOriginal guarda a função antiga (registro rápido). */
function renderTreinoBody(){
  var panel = document.getElementById('mainPanel');
  if(tState.subTab==='registro'){ window.renderTreinoOriginal(); return; }

  var head = window.renderDateNavExport ? '' : ''; // date nav não se aplica às sub-abas de rotina
  if(tState.subTab==='rotinas'){ panel.innerHTML = renderTreinoSubNav()+renderRotinasTab(); return; }
  if(tState.subTab==='executar'){ panel.innerHTML = renderTreinoSubNav()+'<div class="section-panel">Carregando…</div>'; renderExecutarTab(); return; }
  if(tState.subTab==='compartilhar'){ panel.innerHTML = renderTreinoSubNav()+'<div class="section-panel">Carregando…</div>'; renderCompartilharTab(); return; }
}

/* ── Rotinas: lista + builder ── */
function renderRotinasTab(){
  if(tState.rotinaEditando) return renderRotinaForm();

  var html = '<div class="section-panel">'+
    '<div class="sp-header"><span class="sp-title">🏋️ Minhas rotinas</span>'+
    '<button class="sp-add" onclick="novaRotina()">+ Nova rotina</button></div>';

  if(!tState.rotinas.length){
    html += '<div class="no-data">Nenhuma rotina criada ainda. Crie uma do zero ou use a sugestão automática.</div>';
  } else {
    html += '<div class="rotina-list">'+tState.rotinas.map(function(r){
      var dias = (r.dias_semana||[]).map(function(d){return DIAS[d];}).join(', ')||'sem dias definidos';
      return '<div class="rotina-card">'+
        '<div style="flex:1"><div class="rotina-nome">'+tEsc(r.nome)+'</div>'+
        '<div class="rotina-meta">'+(r.objetivo||'geral')+' · '+dias+'</div></div>'+
        '<button class="hc-btn" onclick="editarRotina(\''+r.id+'\')">Editar</button>'+
        '<button class="hc-btn" onclick="excluirRotina(\''+r.id+'\')" style="color:#B91C1C">Excluir</button>'+
      '</div>';
    }).join('')+'</div>';
  }
  html += renderSugestaoForm();
  html += '</div>';
  return html;
}

function renderSugestaoForm(){
  if(!tState.sugestaoAberta){
    return '<div style="margin-top:10px"><button class="btn-save" onclick="abrirSugestao()">✨ Sugerir treino pra mim</button></div>';
  }
  return '<div class="sugestao-form">'+
    '<div class="mf-row">'+
      '<div class="mf-field"><label>Objetivo</label><select id="sugObjetivo">'+
        ['hipertrofia','emagrecimento','condicionamento','geral'].map(function(o){
          return '<option value="'+o+'">'+o.charAt(0).toUpperCase()+o.slice(1)+'</option>';
        }).join('')+
      '</select></div>'+
      '<div class="mf-field"><label>Dias por semana</label><select id="sugDias">'+
        [1,2,3,4,5,6].map(function(d){ return '<option value="'+d+'"'+(d===3?' selected':'')+'>'+d+'</option>'; }).join('')+
      '</select></div>'+
    '</div>'+
    '<div class="modal-actions">'+
      '<button class="btn-cancel" onclick="fecharSugestao()">Cancelar</button>'+
      '<button class="btn-save" onclick="confirmarSugestao()">Gerar treino</button>'+
    '</div></div>';
}

function abrirSugestao(){ tState.sugestaoAberta = true; renderTreinoBody(); }
function fecharSugestao(){ tState.sugestaoAberta = false; renderTreinoBody(); }
function confirmarSugestao(){
  var objetivo = document.getElementById('sugObjetivo').value;
  var dias = parseInt(document.getElementById('sugDias').value,10)||3;
  tState.sugestaoAberta = false;
  suggestRotinas(objetivo, dias);
}

function novaRotina(){
  tState.rotinaEditando = {nome:'', objetivo:'geral', dias_semana:[], itens:[]};
  renderTreinoBody();
}

function editarRotina(id){
  var r = tState.rotinas.find(function(x){return x.id===id;});
  if(!r) return;
  rotinaExercicios(id).then(function(itens){
    tState.rotinaEditando = {id:r.id, nome:r.nome, objetivo:r.objetivo||'geral', dias_semana:(r.dias_semana||[]).slice(), itens:itens||[]};
    renderTreinoBody();
  });
}

function excluirRotina(id){
  if(!confirm('Excluir esta rotina?')) return;
  db.from('rotinas').eq('id',id).delete().then(function(){
    tState.rotinas = tState.rotinas.filter(function(r){return r.id!==id;});
    renderTreinoBody();
  }).catch(function(e){alert('Erro: '+e.message);});
}

function renderRotinaForm(){
  var r = tState.rotinaEditando;
  var html = '<div class="section-panel">'+
    '<div class="sp-header"><span class="sp-title">'+(r.id?'✏️ Editar rotina':'➕ Nova rotina')+'</span>'+
    '<button class="hc-btn" onclick="cancelarRotina()">← Voltar</button></div>'+
    '<div class="mf-field"><label>Nome da rotina</label><input id="rNome" type="text" value="'+tEsc(r.nome)+'" placeholder="Ex: Treino ABC"/></div>'+
    '<div class="mf-row">'+
      '<div class="mf-field"><label>Objetivo</label><select id="rObjetivo">'+
        ['hipertrofia','emagrecimento','condicionamento','geral'].map(function(o){
          return '<option value="'+o+'"'+(o===r.objetivo?' selected':'')+'>'+o.charAt(0).toUpperCase()+o.slice(1)+'</option>';
        }).join('')+
      '</select></div>'+
      '<div class="mf-field"><label>Dias da semana</label><div class="dias-pick">'+
        DIAS.map(function(d,i){
          return '<button type="button" class="day-opt'+(r.dias_semana.indexOf(i)!==-1?' sel':'')+'" onclick="toggleDia('+i+')">'+d+'</button>';
        }).join('')+
      '</div></div>'+
    '</div>'+
    '<div class="sp-header" style="margin-top:14px"><span class="sp-title">Exercícios</span>'+
    '<button class="sp-add" onclick="addItemRotina()">+ Exercício</button></div>'+
    '<div id="itensRotina">'+renderItensRotina()+'</div>'+
    '<div class="modal-actions" style="margin-top:14px">'+
      '<button class="btn-cancel" onclick="cancelarRotina()">Cancelar</button>'+
      '<button class="btn-save" onclick="salvarRotina()">Salvar rotina</button>'+
    '</div></div>';
  return html;
}

function renderItensRotina(){
  var r = tState.rotinaEditando;
  if(!r.itens.length) return '<div class="no-data">Nenhum exercício adicionado.</div>';
  return '<div class="itens-list">'+r.itens.map(function(it,i){
    return '<div class="item-rotina">'+
      '<select onchange="setItemExercicio('+i+',this.value)">'+
        '<option value="">— escolha —</option>'+
        GRUPOS.map(function(g){
          var opts = tState.exercicios.filter(function(e){return e.grupo_muscular===g;});
          if(!opts.length) return '';
          return '<optgroup label="'+GRUPO_LBL[g]+'">'+opts.map(function(e){
            return '<option value="'+e.id+'"'+(e.id===it.exercicio_id?' selected':'')+'>'+tEsc(e.nome)+'</option>';
          }).join('')+'</optgroup>';
        }).join('')+
      '</select>'+
      '<input type="number" min="1" value="'+(it.series||3)+'" placeholder="séries" onchange="setItemField('+i+',\'series\',this.value)" style="width:60px"/>'+
      '<input type="text" value="'+tEsc(it.reps_alvo||'10-12')+'" placeholder="reps" onchange="setItemField('+i+',\'reps_alvo\',this.value)" style="width:70px"/>'+
      '<input type="number" step="0.5" value="'+(it.carga_sugerida_kg||'')+'" placeholder="kg" onchange="setItemField('+i+',\'carga_sugerida_kg\',this.value)" style="width:70px"/>'+
      '<button class="wk-del" onclick="removeItemRotina('+i+')">×</button>'+
    '</div>';
  }).join('')+'</div>';
}

function addItemRotina(){
  tState.rotinaEditando.itens.push({exercicio_id:'', series:3, reps_alvo:'10-12', carga_sugerida_kg:null, descanso_seg:60});
  document.getElementById('itensRotina').innerHTML = renderItensRotina();
}
function removeItemRotina(i){ tState.rotinaEditando.itens.splice(i,1); document.getElementById('itensRotina').innerHTML = renderItensRotina(); }
function setItemExercicio(i,v){ tState.rotinaEditando.itens[i].exercicio_id = v; }
function setItemField(i,field,v){ tState.rotinaEditando.itens[i][field] = field==='series'?parseInt(v)||3:(field==='carga_sugerida_kg'?(parseFloat(v)||null):v); }
function toggleDia(i){
  var arr = tState.rotinaEditando.dias_semana;
  var idx = arr.indexOf(i);
  if(idx===-1) arr.push(i); else arr.splice(idx,1);
  renderTreinoBody();
}
function cancelarRotina(){ tState.rotinaEditando=null; renderTreinoBody(); }

function salvarRotina(){
  var r = tState.rotinaEditando;
  r.nome = (document.getElementById('rNome').value||'').trim();
  r.objetivo = document.getElementById('rObjetivo').value;
  if(!r.nome){ alert('Dê um nome pra rotina.'); return; }
  var itensValidos = r.itens.filter(function(it){return it.exercicio_id;});

  var payload = {nome:r.nome, objetivo:r.objetivo, dias_semana:r.dias_semana};
  var op = r.id ? db.from('rotinas').eq('id',r.id).update(payload) : db.from('rotinas').insert(payload);

  op.then(function(res){
    var saved = Array.isArray(res)?res[0]:res;
    var rotinaId = saved.id;
    var cleanup = r.id ? db.from('rotina_exercicios').eq('rotina_id',rotinaId).delete() : Promise.resolve();
    return cleanup.then(function(){
      var inserts = itensValidos.map(function(it,i){
        return db.from('rotina_exercicios').insert({
          rotina_id: rotinaId, exercicio_id: it.exercicio_id, ordem: i,
          series: it.series, reps_alvo: it.reps_alvo, carga_sugerida_kg: it.carga_sugerida_kg, descanso_seg: it.descanso_seg||60
        });
      });
      return Promise.all(inserts).then(function(){ return saved; });
    });
  }).then(function(saved){
    var idx = tState.rotinas.findIndex(function(x){return x.id===saved.id;});
    if(idx===-1) tState.rotinas.push(saved); else tState.rotinas[idx]=saved;
    tState.rotinaEditando = null;
    renderTreinoBody();
  }).catch(function(e){ alert('Erro ao salvar: '+e.message); });
}

/* ── Sugestão automática (regra, não LLM) ── */
var TEMPLATES = {
  1: [['peito','costas','perna','ombro','core']],
  2: [['peito','ombro','triceps'], ['costas','perna','biceps']],
  3: [['peito','triceps'], ['costas','biceps'], ['perna','ombro','core']],
  4: [['peito','triceps'], ['costas','biceps'], ['perna'], ['ombro','core','cardio']],
  5: [['peito'],['costas'],['perna'],['ombro'],['biceps','triceps','core']],
  6: [['peito'],['costas'],['perna'],['ombro'],['biceps','triceps'],['core','cardio']]
};
var OBJ_REPS = {hipertrofia:'8-12', emagrecimento:'15-20', condicionamento:'12-15', geral:'10-12'};
var OBJ_SERIES = {hipertrofia:4, emagrecimento:3, condicionamento:3, geral:3};

function suggestRotinas(objetivo, dias){
  var template = TEMPLATES[dias];
  var reps = OBJ_REPS[objetivo], series = OBJ_SERIES[objetivo];
  var ops = template.map(function(grupos, i){
    var itens = [];
    grupos.forEach(function(g){
      var opts = tState.exercicios.filter(function(e){return e.grupo_muscular===g;});
      opts.slice(0, g==='cardio'?1:2).forEach(function(e){
        itens.push({exercicio_id:e.id, series:series, reps_alvo:reps, carga_sugerida_kg:null, descanso_seg:60});
      });
    });
    var nomeDia = 'Treino '+String.fromCharCode(65+i)+' ('+grupos.map(function(g){return GRUPO_LBL[g];}).join('/')+')';
    return db.from('rotinas').insert({nome:nomeDia, objetivo:objetivo, dias_semana:[]}).then(function(res){
      var rotina = Array.isArray(res)?res[0]:res;
      var inserts = itens.map(function(it,idx){
        return db.from('rotina_exercicios').insert({
          rotina_id:rotina.id, exercicio_id:it.exercicio_id, ordem:idx,
          series:it.series, reps_alvo:it.reps_alvo, carga_sugerida_kg:it.carga_sugerida_kg, descanso_seg:it.descanso_seg
        });
      });
      return Promise.all(inserts).then(function(){ return rotina; });
    });
  });
  Promise.all(ops).then(function(rotinas){
    tState.rotinas = tState.rotinas.concat(rotinas);
    renderTreinoBody();
  }).catch(function(e){ alert('Erro ao gerar sugestão: '+e.message); });
}

/* ── Executar treino ── */
function renderExecutarTab(){
  if(!tState.rotinas.length){
    document.getElementById('mainPanel').innerHTML = renderTreinoSubNav()+
      '<div class="section-panel"><div class="no-data">Crie uma rotina primeiro, na aba "Minhas rotinas".</div></div>';
    return;
  }
  if(!tState.execucaoAtual){
    var html = '<div class="section-panel"><div class="sp-title" style="margin-bottom:10px">Escolha o treino de hoje</div>'+
      '<div class="rotina-list">'+tState.rotinas.map(function(r){
        return '<div class="rotina-card"><div style="flex:1"><div class="rotina-nome">'+tEsc(r.nome)+'</div></div>'+
          '<button class="btn-save" onclick="iniciarExecucao(\''+r.id+'\')">Começar</button></div>';
      }).join('')+'</div></div>';
    document.getElementById('mainPanel').innerHTML = renderTreinoSubNav()+html;
    return;
  }
  renderExecucaoAtiva();
}

function iniciarExecucao(rotinaId){
  var rotina = tState.rotinas.find(function(r){return r.id===rotinaId;});
  Promise.all([
    rotinaExercicios(rotinaId),
    db.from('treino_execucoes').insert({rotina_id:rotinaId, data:todayStrExport()})
  ]).then(function(res){
    var itens = res[0]||[];
    var execucao = Array.isArray(res[1])?res[1][0]:res[1];
    var series = {};
    itens.forEach(function(it){
      series[it.id] = [];
      for(var i=0;i<(it.series||3);i++) series[it.id].push({reps_feitas:null, carga_kg:it.carga_sugerida_kg, concluida:false});
    });
    tState.execucaoAtual = {rotina:rotina, itens:itens, execucaoId:execucao.id, iniciadoEm:execucao.iniciado_em, series:series};
    renderExecucaoAtiva();
  }).catch(function(e){ alert('Erro: '+e.message); });
}

function renderExecucaoAtiva(){
  var ex = tState.execucaoAtual;
  var html = '<div class="section-panel">'+
    '<div class="sp-header"><span class="sp-title">💪 '+tEsc(ex.rotina.nome)+'</span>'+
    '<button class="hc-btn" onclick="cancelarExecucao()">Cancelar</button></div>';

  html += ex.itens.map(function(it){
    var exInfo = tState.exercicios.find(function(e){return e.id===it.exercicio_id;});
    var nome = exInfo?exInfo.nome:'Exercício';
    var sets = ex.series[it.id]||[];
    var setsHtml = sets.map(function(s,si){
      return '<div class="serie-row'+(s.concluida?' done':'')+'">'+
        '<span class="serie-num">Série '+(si+1)+'</span>'+
        '<input type="number" placeholder="reps" value="'+(s.reps_feitas||'')+'" onchange="setSerieField(\''+it.id+'\','+si+',\'reps_feitas\',this.value)" style="width:60px"/>'+
        '<input type="number" step="0.5" placeholder="kg" value="'+(s.carga_kg||'')+'" onchange="setSerieField(\''+it.id+'\','+si+',\'carga_kg\',this.value)" style="width:70px"/>'+
        '<button class="hc-check'+(s.concluida?' done':'')+'" style="width:30px;height:30px;font-size:.8rem" onclick="toggleSerie(\''+it.id+'\','+si+')">'+(s.concluida?'✓':'')+'</button>'+
      '</div>';
    }).join('');
    return '<div class="exercicio-exec"><div class="ee-nome">'+tEsc(nome)+' <span style="color:#aaa;font-size:.7rem">('+(it.reps_alvo||'')+' reps)</span></div>'+setsHtml+'</div>';
  }).join('');

  html += '<div class="modal-actions" style="margin-top:14px">'+
    '<button class="btn-save" onclick="finalizarExecucao()">✓ Finalizar treino</button>'+
  '</div></div>';

  document.getElementById('mainPanel').innerHTML = renderTreinoSubNav()+html;
}

function setSerieField(itemId, idx, field, val){
  var s = tState.execucaoAtual.series[itemId][idx];
  s[field] = field==='reps_feitas' ? (parseInt(val)||null) : (parseFloat(val)||null);
}
function toggleSerie(itemId, idx){
  var s = tState.execucaoAtual.series[itemId][idx];
  s.concluida = !s.concluida;
  renderExecucaoAtiva();
}
function cancelarExecucao(){
  var execId = tState.execucaoAtual.execucaoId;
  db.from('treino_execucoes').eq('id',execId).delete().then(function(){
    tState.execucaoAtual = null;
    renderExecutarTab();
  });
}

function finalizarExecucao(){
  var ex = tState.execucaoAtual;
  var inserts = [];
  var totalSeries = 0, totalReps = 0;
  Object.keys(ex.series).forEach(function(itemId){
    ex.series[itemId].forEach(function(s, si){
      var it = ex.itens.find(function(x){return x.id===itemId;});
      inserts.push(db.from('execucao_series').insert({
        execucao_id: ex.execucaoId, exercicio_id: it.exercicio_id, serie_num: si+1,
        reps_feitas: s.reps_feitas, carga_kg: s.carga_kg, concluida: s.concluida
      }));
      if(s.concluida){ totalSeries++; totalReps += (s.reps_feitas||0); }
    });
  });
  var agora = new Date();
  var duracaoMin = ex.iniciadoEm ? Math.max(1, Math.round((agora - new Date(ex.iniciadoEm)) / 60000)) : 45;
  Promise.all(inserts).then(function(){
    return db.from('treino_execucoes').eq('id',ex.execucaoId).update({finalizado_em: agora.toISOString()});
  }).then(function(){
    // Compat: resumo também vira um registro simples em workouts (aparece no "Hoje")
    return db.from('workouts').insert({
      date: todayStrExport(), type:'Musculação', duration_min: duracaoMin, intensity: 3,
      notes: ex.rotina.nome+' — '+totalSeries+' série'+(totalSeries===1?'':'s')+' concluída'+(totalSeries===1?'':'s')
    });
  }).then(function(){
    tState.execucaoAtual = null;
    window._treinoAvancadoLoaded = false;
    renderTreino();
    if(window.syncAutoTrackGoals) window.syncAutoTrackGoals();
  }).catch(function(e){ alert('Erro ao salvar: '+e.message); });
}

/* ── Compartilhar com personal ── */
function renderCompartilharTab(){
  db.rpc('my_trainer_grants', {}).then(function(rows){
    tState.grants = rows||[];
    var html = '<div class="section-panel">'+
      '<div class="sp-title" style="margin-bottom:8px">🧑‍🏫 Compartilhar treino com um personal</div>'+
      '<p style="font-size:.75rem;color:#999;margin-bottom:10px">O personal só vê e edita suas rotinas de treino — nunca financeiro, humor, sono ou outros dados.</p>'+
      '<button class="btn-save" onclick="gerarConviteTrainer()">Gerar código para personal</button>'+
      '<div id="trainerCode" style="margin-top:10px"></div>'+
      '<div style="margin-top:16px">'+
        (tState.grants.length ? tState.grants.map(function(g){
          return '<div class="rotina-card"><div style="flex:1">'+
            '<div class="rotina-nome">'+(g.trainer_name?tEsc(g.trainer_name):'Convite código '+g.invite_code)+'</div>'+
            '<div class="rotina-meta">'+(g.status==='ativo'?'✓ Ativo':'Aguardando personal aceitar')+'</div></div>'+
            '<button class="hc-btn" style="color:#B91C1C" onclick="revogarTrainer(\''+g.id+'\')">Revogar</button></div>';
        }).join('') : '<div class="no-data">Nenhum personal com acesso ainda.</div>')+
      '</div></div>';
    document.getElementById('mainPanel').innerHTML = renderTreinoSubNav()+html;
  });
}

function gerarConviteTrainer(){
  db.rpc('create_trainer_invite', {}).then(function(code){
    document.getElementById('trainerCode').innerHTML =
      '<div class="grp-code-row" style="max-width:300px"><span>Código pro personal</span><strong>'+tEsc(code)+'</strong></div>';
    renderCompartilharTab();
  }).catch(function(e){ alert('Erro: '+e.message); });
}

function revogarTrainer(id){
  if(!confirm('Revogar acesso deste personal?')) return;
  db.rpc('revoke_trainer', {grant_id:id}).then(function(){ renderCompartilharTab(); });
}

/* ── Export helpers usados por app.js ── */
function todayStrExport(){ var n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0'); }

window.setTreinoSubTab = setTreinoSubTab;
window.renderTreinoSubNav = renderTreinoSubNav;
window.novaRotina = novaRotina; window.editarRotina = editarRotina; window.excluirRotina = excluirRotina;
window.cancelarRotina = cancelarRotina; window.salvarRotina = salvarRotina;
window.addItemRotina = addItemRotina; window.removeItemRotina = removeItemRotina;
window.setItemExercicio = setItemExercicio; window.setItemField = setItemField; window.toggleDia = toggleDia;
window.abrirSugestao = abrirSugestao; window.fecharSugestao = fecharSugestao; window.confirmarSugestao = confirmarSugestao;
window.iniciarExecucao = iniciarExecucao; window.cancelarExecucao = cancelarExecucao;
window.setSerieField = setSerieField; window.toggleSerie = toggleSerie; window.finalizarExecucao = finalizarExecucao;
window.gerarConviteTrainer = gerarConviteTrainer; window.revogarTrainer = revogarTrainer;
window.loadTreinoAvancado = loadTreinoAvancado; window.renderTreinoBody = renderTreinoBody;

}());
