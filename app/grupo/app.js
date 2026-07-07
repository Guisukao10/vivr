(function(){
'use strict';

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function loadInfo(){
  db.rpc('my_group_info', {}).then(function(rows){
    var row = (rows||[])[0];
    var el = document.getElementById('grpInfo');
    if(!row){ el.innerHTML = '<p>Não foi possível carregar seu grupo.</p>'; return; }
    var membros = (row.member_names||[]).filter(Boolean);
    el.innerHTML =
      '<div class="grp-code-row"><span>Código de convite</span><strong>'+esc(row.invite_code)+'</strong></div>'+
      '<div class="grp-members"><span>Membros</span> '+(membros.length?membros.map(esc).join(', '):'só você')+'</div>'+
      '<p class="grp-note">Compartilhe o código acima com quem você quer que veja o mesmo financeiro/metas/hábitos.</p>';
  }).catch(function(e){
    document.getElementById('grpInfo').innerHTML = '<p>Erro ao carregar: '+esc(e.message)+'</p>';
  });
}

function join(){
  var code = document.getElementById('inpCode').value.trim();
  var migrate = document.getElementById('chkMigrate').checked;
  var msg = document.getElementById('joinMsg');
  if(!code){ msg.textContent = 'Digite um código.'; return; }

  var btn = document.getElementById('btnJoin');
  btn.disabled = true; btn.textContent = 'Entrando...';
  msg.textContent = '';

  db.rpc('join_group', {code: code, migrate: migrate}).then(function(){
    msg.textContent = '✓ Você entrou no grupo! Recarregando...';
    setTimeout(function(){ window.location.reload(); }, 1200);
  }).catch(function(e){
    msg.textContent = 'Erro: ' + (e.message.indexOf('Código inválido')!==-1 ? 'código inválido' : e.message);
    btn.disabled = false; btn.textContent = 'Entrar no grupo';
  });
}

loadInfo();
document.getElementById('btnJoin').addEventListener('click', join);

}());
