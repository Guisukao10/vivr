# Grupos: individual, casal e família — design

## Contexto

O vivr hoje isola dados estritamente por `user_id = auth.uid()` em todas as 22 tabelas do banco. Isso funciona para uso individual, mas o vivr foi sempre pensado (mesmo antes de virar SaaS) para uso a dois — o próprio `profiles.plan` já tem um valor `'couple'` nunca usado, e várias tabelas (`goals`, `workouts`) têm um campo `person` que hoje não tem função real.

O plano de lançamento inclui dar acesso a amigos para testar o produto. Cada amigo precisa ver só os próprios dados — mas quem quiser usar como casal ou família precisa compartilhar um único financeiro/metas/hábitos entre os membros do grupo, exatamente como o autor já usa pessoalmente hoje (dados de "Guilherme e Giulia" combinados).

Este documento desenha a mudança de arquitetura que sustenta os três casos (individual, casal, família) com o mesmo modelo de dados, sem quebrar o isolamento entre grupos diferentes.

## Fora de escopo (specs futuras, já decompostas)

- Metas como hub conectando os outros módulos
- Limpeza visual do módulo financeiro (gráficos grandes, paleta azul divergente — já registrado em `DESIGN.md`)
- Auditoria de "zero localStorage" e testes de isolamento com múltiplas contas reais de amigos

## 1. Modelo de dados

### Tabela nova `groups`
```sql
CREATE TABLE public.groups (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text,
  invite_code text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);
```
`invite_code`: string curta (ex: 6 caracteres alfanuméricos maiúsculos, tipo `A3F9K2`), gerada na criação do grupo.

### `profiles` ganha `group_id`
```sql
ALTER TABLE public.profiles ADD COLUMN group_id text REFERENCES public.groups(id);
```

### Função `current_group_id()`
```sql
CREATE OR REPLACE FUNCTION public.current_group_id()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT group_id FROM public.profiles WHERE id = auth.uid();
$$;
```
`SECURITY DEFINER` para poder ler `profiles` de dentro de uma policy sem depender de RLS recursiva.

### As 22 tabelas de dados ganham `group_id`
`categorias`, `subcategorias`, `responsaveis`, `status_lancamento`, `tipos_pagamento`, `lancamentos`, `budget_plan`, `budget_income`, `habits`, `habit_logs`, `goals`, `goal_logs`, `workouts`, `nutrition_logs`, `nutrition_goals`, `saved_foods`, `mood_logs`, `sleep_logs`, `water_logs`, `body_metrics`, `daily_tasks`, `daily_checks`.

Para cada uma:
```sql
ALTER TABLE public.<tabela> ADD COLUMN group_id text REFERENCES public.groups(id) DEFAULT public.current_group_id();

DROP POLICY user_isolation ON public.<tabela>;
CREATE POLICY group_isolation ON public.<tabela>
  FOR ALL USING (group_id = public.current_group_id())
  WITH CHECK (group_id = public.current_group_id());
```
`user_id` permanece intacto em cada tabela (não é removido) — grava quem criou o registro, mas deixa de ser o campo usado pela policy.

### `handle_new_user()` estendida
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  new_group_id text;
BEGIN
  INSERT INTO public.groups (name, invite_code)
  VALUES (NEW.raw_user_meta_data->>'name', public.generate_invite_code())
  RETURNING id INTO new_group_id;

  INSERT INTO public.profiles (id, name, email, group_id)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'name', NEW.email, new_group_id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;
```
(`generate_invite_code()` é uma função auxiliar simples que gera 6 caracteres alfanuméricos e verifica unicidade.)

## 2. Convite e entrada em grupo

Nova página `app/grupo/index.html` + `app/grupo/app.js`, seguindo o mesmo padrão de nav/auth dos outros módulos:

- Mostra o `invite_code` do grupo atual do usuário (`profiles.group_id` → `groups.invite_code`) e os nomes de quem mais está no grupo (`profiles` filtrado por `group_id`)
- Campo "Entrar em grupo": usuário digita um código

**Importante — isso não pode ser um `UPDATE` direto do client.** Se a tela simplesmente fizesse `db.from('profiles').update({group_id})`, qualquer pessoa que descobrisse/adivinhasse um `group_id` de outra conta (que não é secreto — aparece em respostas de API, logs etc.) entraria no grupo dela sem nunca ter sabido o `invite_code` verdadeiro. A validação do código precisa acontecer no servidor, não no client.

Solução: uma função Postgres `join_group(code text, migrate boolean)`, `SECURITY DEFINER`, chamada via RPC (`db` já tem o padrão de fetch para `/rest/v1/rpc/...`, só adicionar um helper em `assets/supabase.js`):
1. Resolve o `group_id` a partir do `invite_code` recebido (server-side — o client nunca precisa de acesso de leitura direto à tabela `groups` para isso)
2. Se não encontrar o código, retorna erro ("Código inválido")
3. Se `migrate = true`: dentro da mesma função, roda o `UPDATE` nas 22 tabelas (`SET group_id = novo_grupo WHERE user_id = auth.uid() AND group_id = grupo_solo_antigo`) e depois atualiza `profiles.group_id`
4. Se `migrate = false`: só atualiza `profiles.group_id`

A tabela `groups` fica sem policy de `SELECT` direta para o client (nenhuma tela lê `groups` diretamente) — a página de configurações mostra o `invite_code` do próprio usuário via um `SELECT` em `profiles` que já traz esse dado por join, ou via outra function `my_group_info()` que só devolve os dados do grupo de quem chama.

Nenhuma outra tela do sistema muda: `StorageService`/`db.from()` em todos os módulos continuam iguais, porque a RLS já resolve a visibilidade por grupo automaticamente.

## 3. Migração dos dados existentes

Antes de trocar as policies, rodar uma migration one-off:
1. Para cada `user_id` distinto já presente nas 22 tabelas (hoje, principalmente a conta `guilherme.b.alamino@gmail.com`), criar um grupo solo automaticamente (mesma lógica do trigger) caso `profiles.group_id` ainda seja nulo
2. Fazer `UPDATE <tabela> SET group_id = (SELECT group_id FROM profiles WHERE id = <tabela>.user_id) WHERE group_id IS NULL`

## 4. Verificação

1. Criar uma segunda conta de teste — confirmar que ela não vê nenhum dado da primeira (grupos diferentes, criados automaticamente no signup)
2. Pegar o `invite_code` da primeira conta, entrar com a segunda escolhendo "migrar dados" — confirmar que os financeiro/metas da segunda conta somem do grupo antigo e apareçam combinados com os da primeira
3. Lançar uma despesa pela segunda conta e confirmar que aparece para a primeira, com o `user_id` correto identificando quem lançou
4. Testar o caminho "não migrar": criar uma terceira conta, entrar em grupo sem migrar, confirmar que os dados dela ficam vazios no grupo novo (nada quebra, só não carrega o histórico antigo)
