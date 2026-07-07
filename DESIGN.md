# Design System: Vivr — Personal Life OS

> Este documento descreve o design **como ele existe hoje** no código do vivr — não é uma prescrição de "boas práticas anti-genéricas" (ver nota abaixo). Serve como referência para manter consistência ao adicionar novas telas.
>
> **Nota:** este arquivo foi gerado com a skill `taste-design` (Google Stitch), cuja lista de "anti-padrões" padrão baniria a fonte Inter, o roxo como acento e o uso de emojis como ícones. Decisão consciente: o vivr já usa essas três coisas de forma consistente em dezenas de arquivos como parte da marca estabelecida, então este documento as trata como regras válidas do sistema, não como algo a corrigir.

## 1. Visual Theme & Atmosphere

Um SaaS pessoal, denso e utilitário — mais "app de produtividade do dia a dia" do que "vitrine artística". Densidade **Daily App Balanced (5/10)**: cards compactos, tipografia pequena (a maior parte do texto de interface fica entre 0.6rem e 0.95rem), muita informação por tela. Variância **Predictable Symmetric (3/10)**: grids centralizados, cards em grade uniforme, hero centralizado na landing page. Movimento **Static Restrained (2/10)**: apenas transições de opacidade/transform em hover (`.15s`–`.2s`), sem física de mola, sem microloop perpétuo.

A landing page (`index.html`) foge um pouco desse padrão: usa gradientes no logo/CTA e badge pulsante (`@keyframes pulse`), mas o app propriamente dito (`app/`) é sóbrio.

## 2. Color Palette & Roles

Paleta de marca, usada em `assets/shared.css` e na landing page:

- **Vivr Purple** (`#7C3AED`) — Acento único da marca: links ativos, CTAs primários, logo
- **Vivr Purple Light** (`#EDE9FE`) — Fundo de badges/pills ativos, hover leve
- **Vivr Dark** (`#0F0F0F`) — Texto principal, título do logo
- **Vivr Gray** (`#F4F4F5`) — Fundo neutro, hover de links de navegação
- **Branco** (`#FFFFFF`) — Superfície de cards e nav
- **Bordas** (`#E4E4E7` / `#eaeaea`) — 1px, estrutural, em quase todo card/input

**Acentos por módulo** (cor de identificação de cada área, usada em `app/index.html` e nos `style.css` de cada módulo):
- Financeiro (shell/home card): Verde `#15803D`
- Metas: Roxo `#7C3AED` (mesmo tom da marca)
- Nutrição: Laranja `#EA580C`
- Hábitos: Roxo `#9333EA` (tom *diferente* do roxo de marca — inconsistência existente, não corrigida)
- Saúde: Rosa/vermelho `#E11D48`

**Inconsistência conhecida:** as páginas novas do módulo Financeiro (`cadastros.html`, `lancamentos.html`, `planejador.html`, `index.html` — portadas do Site_Controle) usam uma paleta própria, mais "SaaS genérico", centrada em **Azul `#3b82f6`** (`site-controle.css`, variáveis `--color-primary` etc.), com verde/vermelho/laranja/ciano semânticos para dashboard-cards (`--color-success`, `--color-danger`, `--color-warning`, `--color-info`). Isso não bate com o verde `#15803D` usado no card "Financeiro" da home nem com o roxo de marca. Fica registrado aqui como candidato a unificação futura — não mexido agora por estar fora do escopo do que foi pedido.

## 3. Typography Rules

- **Fonte única em todo o sistema:** `Inter` (pesos 400–900), carregada via Google Fonts em cada página. Não há fonte serifada nem mono dedicada — números de KPI usam o mesmo Inter.
- **Display/Headlines:** landing page usa `clamp(2.2rem, 6vw, 3.8rem)` com `letter-spacing:-.04em`; dentro do app, títulos de página ficam em torno de `1.1–1.5rem`, peso 700–800.
- **Body/UI:** predominantemente pequeno — `.68rem` a `.95rem` para labels, meta-informação, botões. Cor secundária `#888`/`#71717A` para subtítulos.
- **Financeiro (site-controle.css):** usa uma escala tokenizada própria (`--font-size-xs` a `--font-size-3xl`), levemente maior que o resto do app.

## 4. Component Stylings

- **Botões:** preenchimento sólido com a cor de acento do módulo, cantos arredondados (`7px`–`11px`), sem glow. Feedback no hover é `opacity:.85–.88` (módulos antigos) ou `translateY(-2px)` (financeiro novo) — dois padrões coexistindo.
- **Cards:** fundo branco, borda `1px solid #eaeaea`/`#E4E4E7`, cantos `10px`–`16px`, sombra leve só no hover (`0 3px 12px rgba(0,0,0,.07)`). Cards de módulo na home (`.mod-card`) têm uma borda superior colorida de 3px indicando a área.
- **Pills/badges:** fundo tintado + texto na cor do acento (ex: `.today-pill` roxo, `.streak-chip` laranja, `.hc-linked` roxo) — padrão recorrente para tags de status/categoria.
- **Ícones:** emoji Unicode (💰🎯🥗✅❤️📊✍️🗂️📋), não SVG nem biblioteca de ícones. Usado tanto na nav quanto dentro de componentes (streaks, badges).
- **Inputs (financeiro):** label acima, borda `1px`, foco com `box-shadow` tintado na cor primária do módulo.
- **Loading:** texto simples ("Carregando...") — não há skeleton loader em nenhuma página hoje.

## 5. Layout Principles

- Container central `max-width` (`1000px`–`1100px` no app, `760px` na seção de pricing da landing), `margin:0 auto`.
- Grid de cards com `repeat(auto-fit, minmax(...))` — usado na home (`app/index.html`) e nas features da landing.
- Nav superior fixa (`position:sticky`) em todas as páginas do app, com sub-nav secundária própria no módulo Financeiro (`.fin-subnav`).
- Sem grade "3 cards iguais" rígida — a home usa `auto-fit` que se ajusta ao número de módulos.

## 6. Responsive Rules

- Breakpoint principal em `640px` (nav esconde labels de texto, mantém só emoji) e `768px`/`1024px` no financeiro (`site-controle.css`).
- Colapso para coluna única abaixo de `768px` nos formulários (`.form-group{flex-direction:column}`).
- Sem overflow horizontal — tabelas usam `overflow-x:auto` em wrapper dedicado.

## 7. Motion & Interaction

- Transições simples de `.15s`–`.6s` em `opacity`, `background`, `transform`, `stroke-dashoffset` (anel de progresso de hábitos).
- Sem física de mola, sem loops perpétuos de microinteração — motion é restrito e utilitário, condizente com a densidade de dashboard.
- Único destaque "vivo": badge pulsante da landing page (`@keyframes pulse`, opacidade 1↔.4, 2s).

## 8. Padrões intencionais (não são bugs a corrigir)

Itens que a skill `taste-design` marcaria como "anti-padrão IA", mas que aqui são decisões de marca já estabelecidas:
- Fonte Inter em 100% das páginas
- Roxo como acento principal (`#7C3AED`)
- Ícones em emoji em vez de SVG
- Hero centralizado na landing page

## 9. Itens fora de escopo / candidatos a follow-up

- Unificar a paleta azul do Financeiro novo com o verde/roxo do resto do app
- Padronizar o feedback de hover de botão (`opacity` vs `translateY`) entre módulos antigos e novos
- Loading states hoje são só texto — poderia evoluir para skeleton se a experiência exigir
