(function(){
'use strict';

var pState = { clients: [], exercicios: [], selected: null, rotinas: [], editing: null };
var DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
var GRUPOS = ['peito','costas','perna','ombro','biceps','triceps','core','cardio'];
var GRUPO_LBL = {peito:'Peito',costas:'Costas',perna:'Perna',ombro:'Ombro',biceps:'Bíceps',triceps:'Tríceps',core:'Core',cardio:'Cardio'};
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function loadClients(){
  Promise.all([
    db.rpc('my_client_groups', {}),
    db.from('exercicios').select('*')
  ]).then(function(res){
    pState.clients = res[0]||[];
    pState.exercicios = res[1]||[];
    renderClientList();
  }).catch(function(e){
    document.getElementById('clientList').innerHTML = '<div class="pz-msg">Erro: '+esc(e.message)+'</div>';
  });
}

function renderClientList(){
  var el = document.getElementById('clientList');
  el.innerHTML = '<div class="pz-title">Seus clientes</div>'+
    (pState.clients.length ? pState.clients.map(function(c){
      var names = (c.client_names||[]).filter(Boolean).join(', ');
      return '<div class="pz-client'+(pState.selected===c.client_group_id?' sel':'')+'" onclick="selectClient(\''+c.client_group_id+'\')">'+esc(names||'Cliente')+'</div>';
    }).join('') : '<div class="pz-note">Nenhum cliente ainda. Adicione um código acima.</div>');
}

function redeemCode(){
  var code = document.getElementById('inpCode').value.trim();
  var msg = document.getElementById('redeemMsg');
  if(!code){ msg.textContent='Digite um código.'; return; }
  db.rpc('redeem_trainer_invite', {code:code}).then(function(){
    msg.textContent = '✓ Cliente adicionado!';
    document.getElementById('inpCode').value='';
    loadClients();
  }).catch(function(e){
    msg.textContent = 'Erro: código inválido ou já usado';
  });
}

function selectClient(groupId){
  pState.selected = groupId;
  pState.editing = null;
  renderClientList();
  db.from('rotinas').eq('group_id',groupId).select('*').then(function(rows){
    pState.rotinas = rows||[];
    renderDetail();
  });
}

function renderDetail(){
  var el = document.getElementById('clientDetail');
  if(!pState.selected){ el.innerHTML=''; return; }
  if(pState.editing){ el.innerHTML = renderForm(); return; }

  el.innerHTML = '<div class="pz-box">'+
    '<div class="sp-header" style="display:flex;justify-content:space-between;align-items:center">'+
      '<span class="pz-title">Rotinas deste cliente</span>'+
      '<button class="pz-btn" onclick="novaRotinaCliente()">+ Nova rotina</button>'+
    '</div>'+
    (pState.rotinas.length ? pState.rotinas.map(function(r){
      var dias = (r.dias_semana||[]).map(function(d){return DIAS[d];}).join(', ')||'sem dias definidos';
      return '<div class="pz-rotina">'+
        '<div style="flex:1"><strong>'+esc(r.nome)+'</strong><div class="pz-note">'+(r.objetivo||'geral')+' · '+dias+'</div></div>'+
        '<button class="pz-btn-sm" onclick="editRotinaCliente(\''+r.id+'\')">Editar</button>'+
      '</div>';
    }).join('') : '<div class="pz-note">Nenhuma rotina criada ainda pra este cliente.</div>')+
  '</div>';
}

function novaRotinaCliente(){
  pState.editing = {nome:'', objetivo:'geral', dias_semana:[], itens:[]};
  renderDetail();
}

function editRotinaCliente(id){
  var r = pState.rotinas.find(function(x){return x.id===id;});
  db.from('rotina_exercicios').eq('rotina_id',id).order('ordem',{ascending:true}).select('*').then(function(itens){
    pState.editing = {id:r.id, nome:r.nome, objetivo:r.objetivo||'geral', dias_semana:(r.dias_semana||[]).slice(), itens:itens||[]};
    renderDetail();
  });
}

function renderForm(){
  var r = pState.editing;
  var html = '<div class="pz-box">'+
    '<div class="sp-header" style="display:flex;justify-content:space-between"><span class="pz-title">'+(r.id?'Editar':'Nova')+' rotina</span>'+
    '<button class="pz-btn-sm" onclick="cancelForm()">← Voltar</button></div>'+
    '<div class="pz-field"><label>Nome</label><input id="pNome" type="text" value="'+esc(r.nome)+'"/></div>'+
    '<div class="pz-field"><label>Objetivo</label><select id="pObjetivo">'+
      ['hipertrofia','emagrecimento','condicionamento','geral'].map(function(o){
        return '<option value="'+o+'"'+(o===r.objetivo?' selected':'')+'>'+o+'</option>';
      }).join('')+'</select></div>'+
    '<div class="pz-field"><label>Dias</label><div class="dias-pick">'+
      DIAS.map(function(d,i){ return '<button type="button" class="day-opt'+(r.dias_semana.indexOf(i)!==-1?' sel':'')+'" onclick="toggleDiaP('+i+')">'+d+'</button>'; }).join('')+
    '</div></div>'+
    '<div class="sp-header" style="margin-top:10px"><span class="pz-title">Exercícios</span><button class="pz-btn-sm" onclick="addItemP()">+ Exercício</button></div>'+
    '<div id="itensP">'+renderItens()+'</div>'+
    '<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">'+
      '<button class="pz-btn-cancel" onclick="cancelForm()">Cancelar</button>'+
      '<button class="pz-btn" onclick="saveRotinaCliente()">Salvar</button>'+
    '</div></div>';
  return html;
}

function renderItens(){
  var r = pState.editing;
  if(!r.itens.length) return '<div class="pz-note">Nenhum exercício.</div>';
  return r.itens.map(function(it,i){
    return '<div class="item-rotina">'+
      '<select onchange="setItemExP('+i+',this.value)">'+
        '<option value="">— escolha —</option>'+
        GRUPOS.map(function(g){
          var opts = pState.exercicios.filter(function(e){return e.grupo_muscular===g;});
          if(!opts.length) return '';
          return '<optgroup label="'+GRUPO_LBL[g]+'">'+opts.map(function(e){
            return '<option value="'+e.id+'"'+(e.id===it.exercicio_id?' selected':'')+'>'+esc(e.nome)+'</option>';
          }).join('')+'</optgroup>';
        }).join('')+
      '</select>'+
      '<input type="number" min="1" value="'+(it.series||3)+'" onchange="setFieldP('+i+',\'series\',this.value)" style="width:55px"/>'+
      '<input type="text" value="'+esc(it.reps_alvo||'10-12')+'" onchange="setFieldP('+i+',\'reps_alvo\',this.value)" style="width:65px"/>'+
      '<input type="number" step="0.5" value="'+(it.carga_sugerida_kg||'')+'" placeholder="kg" onchange="setFieldP('+i+',\'carga_sugerida_kg\',this.value)" style="width:65px"/>'+
      '<button class="wk-del" onclick="removeItemP('+i+')">×</button>'+
    '</div>';
  }).join('');
}

function addItemP(){ pState.editing.itens.push({exercicio_id:'',series:3,reps_alvo:'10-12',carga_sugerida_kg:null,descanso_seg:60}); document.getElementById('itensP').innerHTML = renderItens(); }
function removeItemP(i){ pState.editing.itens.splice(i,1); document.getElementById('itensP').innerHTML = renderItens(); }
function setItemExP(i,v){ pState.editing.itens[i].exercicio_id=v; }
function setFieldP(i,f,v){ pState.editing.itens[i][f] = f==='series'?parseInt(v)||3:(f==='carga_sugerida_kg'?(parseFloat(v)||null):v); }
function toggleDiaP(i){
  var arr = pState.editing.dias_semana;
  var idx = arr.indexOf(i);
  if(idx===-1) arr.push(i); else arr.splice(idx,1);
  renderDetail();
}
function cancelForm(){ pState.editing=null; renderDetail(); }

function saveRotinaCliente(){
  var r = pState.editing;
  r.nome = (document.getElementById('pNome').value||'').trim();
  r.objetivo = document.getElementById('pObjetivo').value;
  if(!r.nome){ alert('Dê um nome.'); return; }
  var itensValidos = r.itens.filter(function(it){return it.exercicio_id;});
  var groupId = pState.selected;

  var payload = {nome:r.nome, objetivo:r.objetivo, dias_semana:r.dias_semana, group_id:groupId};
  var op = r.id ? db.from('rotinas').eq('id',r.id).update(payload) : db.from('rotinas').insert(payload);

  op.then(function(res){
    var saved = Array.isArray(res)?res[0]:res;
    var cleanup = r.id ? db.from('rotina_exercicios').eq('rotina_id',saved.id).delete() : Promise.resolve();
    return cleanup.then(function(){
      var inserts = itensValidos.map(function(it,i){
        return db.from('rotina_exercicios').insert({
          rotina_id:saved.id, exercicio_id:it.exercicio_id, ordem:i, group_id:groupId,
          series:it.series, reps_alvo:it.reps_alvo, carga_sugerida_kg:it.carga_sugerida_kg, descanso_seg:it.descanso_seg||60
        });
      });
      return Promise.all(inserts).then(function(){ return saved; });
    });
  }).then(function(){
    pState.editing = null;
    selectClient(groupId);
  }).catch(function(e){ alert('Erro: '+e.message); });
}

window.redeemCode = redeemCode;
window.selectClient = selectClient;
window.novaRotinaCliente = novaRotinaCliente;
window.editRotinaCliente = editRotinaCliente;
window.cancelForm = cancelForm;
window.addItemP = addItemP; window.removeItemP = removeItemP;
window.setItemExP = setItemExP; window.setFieldP = setFieldP; window.toggleDiaP = toggleDiaP;
window.saveRotinaCliente = saveRotinaCliente;

document.getElementById('btnRedeem').addEventListener('click', redeemCode);
loadClients();

}());
