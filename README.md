# Сайт-приглашение на свадьбу · Алексей и Вероника · 29.08.2026

Персонализированное приглашение: у каждого гостя своя ссылка с кодом. По коду
гость «авторизован» — видит своё имя, подтверждает присутствие и заполняет
опросник, ответы которого **сохраняются автоматически** при каждом действии
(без кнопки «отправить»).

## Архитектура

- **Фронтенд** — статический сайт (vanilla HTML/CSS/JS, без сборки) в `frontend/`,
  хостится на **GitHub Pages**: `https://0kalinin.github.io/wedding-invite/`
- **Бэкенд** — **Supabase** (Postgres + Edge Functions), проект `pinpxzbvxddvrqfpjjlg`
  - Фронт **не** обращается к БД напрямую — только через Edge Functions.
  - Таблицы закрыты RLS; функции работают под service role.

```
frontend/                 статический сайт (Pages)
  index.html  styles.css  app.js  config.js
supabase/
  migrations/0001_init.sql   схема БД (применена через MCP)
  functions/guest/index.ts   гостевой API
  functions/admin/index.ts   админ API
.github/workflows/deploy-pages.yml
```

## Модель данных (`public.guests`)

| поле | назначение |
|---|---|
| `code` | код для персональной ссылки |
| `name` | имя гостя |
| `has_plus_one` | есть ли +1 |
| `plus_one_name` | имя +1, если известно заранее |
| `attendance` | без +1: `yes`/`no`; с +1: `both`/`one`/`none`; `null` = не ответил |
| `plus_one_name_filled` | имя +1, введённое самим гостем |
| `survey` | ответы опросника (jsonb, без строгой валидации) |

## API (Edge Functions)

База: `https://pinpxzbvxddvrqfpjjlg.supabase.co/functions/v1`
Во все запросы добавляется заголовок `apikey: <ANON_KEY>` (см. `frontend/config.js`).

### Гостевой: `/guest`
- `GET /guest?code=КОД` → данные гостя и сохранённое состояние.
- `POST /guest` `{ "code": "КОД", "patch": { ... } }` — автосохранение.
  `patch` может содержать `attendance`, `plus_one_name_filled`, `survey`
  (объект `survey` доливается к текущему — shallow merge).

### Админский: `/admin`
Защищён заголовком `x-admin-token: <ADMIN_TOKEN>`.
Токен хранится в `public.app_config (key='admin_token')`. Получить:

```sql
select value from public.app_config where key = 'admin_token';
```

**Получить подробную информацию по всем гостям:**
```bash
curl -H "apikey: <ANON_KEY>" -H "x-admin-token: <ADMIN_TOKEN>" \
  https://pinpxzbvxddvrqfpjjlg.supabase.co/functions/v1/admin
```
Возвращает всех гостей со всеми полями (attendance, survey и т.д.) и готовой
персональной ссылкой `link` для каждого.

**Изменить список гостей (создать / обновить / удалить):**
```bash
curl -X POST \
  -H "apikey: <ANON_KEY>" -H "x-admin-token: <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
        "upsert": [
          { "name": "Новый гость", "has_plus_one": true, "plus_one_name": "Имя" },
          { "code": "cff45b87", "name": "Лена" }
        ],
        "delete": ["старый_код"]
      }' \
  https://pinpxzbvxddvrqfpjjlg.supabase.co/functions/v1/admin
```
- элемент `upsert` **без** `code` → создаётся новый гость с автогенерированным кодом;
- **с** `code` → обновляется существующий (или создаётся с этим кодом);
- `delete` — массив кодов на удаление.
Ответ — полный обновлённый список со ссылками.

## Деплой фронтенда (GitHub Pages)

1. Один раз: **Settings → Pages → Source: «GitHub Actions»**.
2. Смержить ветку в `main` — workflow `deploy-pages.yml` опубликует `frontend/`.
3. Сайт: `https://0kalinin.github.io/wedding-invite/`, ссылка гостя — `…/?code=КОД`.

Локальный просмотр: `python3 -m http.server -d frontend 8000` → http://localhost:8000

## Безопасность

- `ANON_KEY` публичен — это нормально: БД закрыта RLS, доступ только через функции.
- `ADMIN_TOKEN` — секрет, в репозитории его нет. Хранится в БД, меняется через SQL:
  `update public.app_config set value = '<новый>' where key = 'admin_token';`
- Коды гостей случайны и не перечисляются (гость не видит чужие записи).
