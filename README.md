# HupHup Frontend

React + Vite фронт. Дизайн прототиптен алынған, API — `huphup-backend`.

## Іске қосу

```bash
cp .env.example .env
npm install
npm run dev
```

Ашылады: http://127.0.0.1:5173

Backend істеп тұруы керек: http://127.0.0.1:3000

## Тексеру сценарийі

1. `/register` — buyer жаса
2. Басты бетте заявка жаз → опубликовать
3. Басқа браузерде `/register` — supplier жаса
4. Компания профилін толтыр (қала + категория)
5. `/supplier/leads` → КП жібер
6. Buyer-да `/offers` немесе заявкада «Выбрать»
