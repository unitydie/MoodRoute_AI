# Рефлексия по MoodRoute AI

## 1) Что изменено в конфиге (личность бота, модель, env)
- Вынесены настройки бота в `config/botConfig.js`: `BOT_PERSONALITY`, `SYSTEM_PROMPT`, `DEVELOPER_PROMPT`.
- Добавлен локальный справочник городов Норвегии и POI в `config/norwayCityKnowledge.js` (включая Hamar).
- Через `.env` настраиваются: `OPENAI_API_KEY`, `OPENAI_MODEL`, `RATE_LIMIT_MAX`, `MAX_MESSAGE_LENGTH`, OAuth-параметры GitHub.
- Добавлен режим fallback: если OpenAI недоступен, используется детерминированный mock-ответ.

## 2) Что изменено в стиле (цвета, bubbles, header/footer, font)
- Сделана единая кастомная тема (без Bootstrap): городской визуальный стиль, градиенты, сетка фона.
- Подключены Google Fonts (`Sora` и `Manrope`).
- Разделены стили пузырей для пользователя и ассистента.
- Кастомизированы `header`/`footer`, добавлены анимации в hero-блоке.
- Кнопка `Start Chat` увеличена и вынесена в центр главного экрана.

## 3) Где интегрирован чат в структуру сайта
- Чат встроен в сайт со страницами: `Home`, `Explore`, `About`, `Chat`, `Login`, `Profile`.
- Реализовано два режима:
  - виджет внизу справа;
  - полноэкранная страница `/chat`.
- При авторизации в шапке показывается профиль/аватар и скрывается `Login`.
- Для GitHub-пользователя показывается GitHub-аватар, для локального аккаунта — fallback-аватар.

## 4) Как работает хранение и связка frontend ↔ backend
- Хранение на SQLite: `users`, `sessions`, `user_profiles`, `conversations`, `messages`.
- Чаты привязаны к аккаунту (`conversations.user_id`), чужие чаты недоступны.
- История загружается при открытии страницы, есть `New chat`, `Clear chat`, `Export JSON`.
- Профиль пользователя (`/profile`) хранит пресеты и посещенные места, используется как контекст для рекомендаций.
- Frontend общается с backend по REST: auth, profile, conversations, chat.

## 5) Что улучшить дальше
- Добавить streaming-ответы (SSE/WebSocket) вместо только typing indicator.
- Подключить полноценные миграции БД с версиями схемы.
- Добавить интеграционные и E2E тесты (auth, ownership, chat-flow).
- Подключить внешний источник POI (OSM/Places API) для динамического расширения базы мест.
