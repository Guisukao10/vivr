/* ── Vivr — Supabase client with Auth ── */
var VIVR_URL = 'https://cckalvgublrqkacljymz.supabase.co';
var VIVR_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNja2Fsdmd1YmxycWthY2xqeW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MDA1NTYsImV4cCI6MjA5NjE3NjU1Nn0.v9SFstg90NWhNd0H9aFAt-6uEiz5riDIlnWb_LbqPB8';

var vivr = (function(){
  var url = VIVR_URL, key = VIVR_KEY;
  var _session = null;

  /* ── Auth token from localStorage ── */
  function getToken(){
    try {
      var raw = localStorage.getItem('sb-cckalvgublrqkacljymz-auth-token');
      if(!raw) return key;
      var obj = JSON.parse(raw);
      return (obj && obj.access_token) ? obj.access_token : key;
    } catch(e){ return key; }
  }

  function headers(extra){
    return Object.assign({
      'apikey': key,
      'Authorization': 'Bearer ' + getToken(),
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }, extra||{});
  }

  function req(method, path, body, extraHeaders){
    return fetch(url + '/rest/v1/' + path, {
      method: method,
      headers: headers(extraHeaders),
      body: body ? JSON.stringify(body) : undefined
    }).then(function(r){
      if(!r.ok) return r.text().then(function(t){ throw new Error(t); });
      return r.headers.get('content-type')&&r.headers.get('content-type').indexOf('json')!==-1
        ? r.json() : r.text().then(function(){ return null; });
    });
  }

  /* ── Auth ── */
  var auth = {
    signUp: function(email, password, name){
      return fetch(url+'/auth/v1/signup', {
        method:'POST', headers:{'apikey':key,'Content-Type':'application/json'},
        body: JSON.stringify({email:email, password:password, data:{name:name}})
      }).then(function(r){ return r.json(); }).then(function(d){
        if(d.error) throw new Error(d.error.message||d.msg||JSON.stringify(d));
        if(d.access_token) _saveSession(d);
        return d;
      });
    },
    signIn: function(email, password){
      return fetch(url+'/auth/v1/token?grant_type=password', {
        method:'POST', headers:{'apikey':key,'Content-Type':'application/json'},
        body: JSON.stringify({email:email, password:password})
      }).then(function(r){ return r.json(); }).then(function(d){
        if(d.error) throw new Error(d.error.message||d.msg||JSON.stringify(d));
        if(d.access_token) _saveSession(d);
        return d;
      });
    },
    // Dispara o e-mail de recuperação de senha (fluxo padrão do Supabase Auth) —
    // ninguém além da própria pessoa vê ou define a senha nova.
    recover: function(email, redirectTo){
      var qs = redirectTo ? '?redirect_to=' + encodeURIComponent(redirectTo) : '';
      return fetch(url+'/auth/v1/recover'+qs, {
        method:'POST', headers:{'apikey':key,'Content-Type':'application/json'},
        body: JSON.stringify({email:email})
      }).then(function(r){
        if(r.status===204||r.ok) return true;
        return r.json().then(function(d){ throw new Error(d.error_description||d.msg||d.error||'Erro ao enviar e-mail de recuperação'); });
      });
    },
    // Define a senha nova usando o access_token de recuperação (vem no link do e-mail,
    // não é a sessão normal de login).
    updatePassword: function(recoveryAccessToken, newPassword){
      return fetch(url+'/auth/v1/user', {
        method:'PUT',
        headers:{'apikey':key,'Authorization':'Bearer '+recoveryAccessToken,'Content-Type':'application/json'},
        body: JSON.stringify({password:newPassword})
      }).then(function(r){ return r.json().then(function(d){
        if(!r.ok) throw new Error(d.error_description||d.msg||d.error||'Erro ao definir nova senha');
        return d;
      }); });
    },
    signOut: function(){
      var token = getToken();
      localStorage.removeItem('sb-cckalvgublrqkacljymz-auth-token');
      _session = null;
      return fetch(url+'/auth/v1/logout', {
        method:'POST', headers:{'apikey':key,'Authorization':'Bearer '+token,'Content-Type':'application/json'}
      }).catch(function(){});
    },
    getUser: function(){
      var raw = localStorage.getItem('sb-cckalvgublrqkacljymz-auth-token');
      if(!raw) return null;
      try {
        var s = JSON.parse(raw);
        if(!s||!s.access_token) return null;
        // Check expiry
        if(s.expires_at && Date.now()/1000 > s.expires_at) { localStorage.removeItem('sb-cckalvgublrqkacljymz-auth-token'); return null; }
        return s.user || null;
      } catch(e){ return null; }
    },
    isLoggedIn: function(){ return !!this.getUser(); }
  };

  function _saveSession(d){
    var session = {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: Math.floor(Date.now()/1000) + (d.expires_in||3600),
      user: d.user
    };
    localStorage.setItem('sb-cckalvgublrqkacljymz-auth-token', JSON.stringify(session));
    _session = session;
  }

  /* ── Query builder ── */
  function from(table){
    var _t=table, _f=[], _ord=null, _lim=null;
    var q = {
      eq: function(c,v){ _f.push(c+'=eq.'+encodeURIComponent(v)); return q; },
      neq:function(c,v){ _f.push(c+'=neq.'+encodeURIComponent(v)); return q; },
      gte:function(c,v){ _f.push(c+'=gte.'+encodeURIComponent(v)); return q; },
      lte:function(c,v){ _f.push(c+'=lte.'+encodeURIComponent(v)); return q; },
      order:function(c,o){ _ord=c+(o&&o.ascending===false?'.desc':'.asc'); return q; },
      limit:function(n){ _lim=n; return q; },
      select:function(cols){
        var qs='select='+(cols||'*');
        if(_f.length) qs+='&'+_f.join('&');
        if(_ord) qs+='&order='+_ord;
        if(_lim) qs+='&limit='+_lim;
        return req('GET',_t+'?'+qs);
      },
      insert:function(data){ return req('POST',_t,Array.isArray(data)?data:[data]); },
      update:function(data){
        var qs=_f.length?'?'+_f.join('&'):'';
        return req('PATCH',_t+qs,data);
      },
      upsert:function(data){
        return fetch(url+'/rest/v1/'+_t,{
          method:'POST',
          headers:headers({'Prefer':'return=representation,resolution=merge-duplicates'}),
          body:JSON.stringify(Array.isArray(data)?data:[data])
        }).then(function(r){ return r.ok?r.json():r.text().then(function(t){throw new Error(t);}); });
      },
      delete:function(){
        var qs=_f.length?'?'+_f.join('&'):'';
        return req('DELETE',_t+qs);
      }
    };
    return q;
  }

  /* ── RPC ── */
  function rpc(fnName, args){
    return fetch(url + '/rest/v1/rpc/' + fnName, {
      method: 'POST', headers: headers(), body: JSON.stringify(args||{})
    }).then(function(r){
      if(!r.ok) return r.text().then(function(t){ throw new Error(t); });
      return r.headers.get('content-type')&&r.headers.get('content-type').indexOf('json')!==-1
        ? r.json() : r.text().then(function(){ return null; });
    });
  }

  /* ── Edge Functions ── */
  // Headers próprios (sem "Prefer", que é coisa do PostgREST) — a edge function só libera
  // authorization/content-type/apikey/x-client-info no CORS; mandar "Prefer" faz o preflight
  // falhar e o fetch morre com "Failed to fetch" sem nem chegar a sair do navegador.
  function fn(name, body){
    return fetch(url + '/functions/v1/' + name, {
      method: 'POST',
      headers: {'apikey': key, 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json'},
      body: JSON.stringify(body||{})
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(d){
        if(!r.ok) throw new Error(d.error || ('Erro ' + r.status + ' na função ' + name));
        return d;
      });
    });
  }

  return { auth:auth, from:from, rpc:rpc, fn:fn };
}());

/* ── Guard: redirect to login if not authenticated ── */
function requireAuth(redirectTo){
  if(!vivr.auth.isLoggedIn()){
    window.location.href = (redirectTo || '/vivr/auth/login.html') +
      '?next=' + encodeURIComponent(window.location.pathname);
    return false;
  }
  return true;
}

/* ── Get current user ── */
function currentUser(){ return vivr.auth.getUser(); }

/* ── Alias db = vivr for module compatibility ── */
var db = vivr;
