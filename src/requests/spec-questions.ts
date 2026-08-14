import type {
  GeminiAnalyzeResult,
  GeminiClarifyQuestion,
  GeminiRequestItem,
} from '../gemini/gemini.service';

type SpecRule = {
  id: string;
  match: RegExp;
  satisfied: RegExp;
  question: string;
  placeholder: string;
  options?: string[];
};

const SPEC_RULES: SpecRule[] = [
  {
    id: 'cement',
    match: /цемент|cement/,
    satisfied: /м\s*-?\s*400|м\s*-?\s*500|пц\s*-?\s*400|портланд/,
    question: 'Какая марка цемента нужна?',
    placeholder: 'Например М400',
    options: ['М400', 'М500', 'Пока не знаю'],
  },
  {
    id: 'brick',
    match: /кирпич|крипич|кірпіш|кирпіш|brick/,
    satisfied: /керамич|силикат|облицов|рядов|пустотел|полнотел|1\s*нф/,
    question: 'Какой кирпич нужен: тип и размер?',
    placeholder: 'Керамический / силикатный, пустотелый, 1НФ',
    options: ['Керамический', 'Силикатный', 'Облицовочный', 'Пока не знаю'],
  },
  {
    id: 'cabinet',
    match: /шкаф/,
    satisfied: /\d+\s*(мм|см|м)|лдсп|дсп|мдф|массив|купе|габарит/,
    question: 'Какие шкафы: размер и материал?',
    placeholder: 'Например 200×60×50 см, ЛДСП',
  },
  {
    id: 'pipe',
    match: /труб/,
    satisfied: /\d+\s*(мм|см)|пнд|пвх|ппр|стальн|диаметр|ду\s*\d/,
    question: 'Какие трубы: материал и диаметр?',
    placeholder: 'ПНД / ПВХ / сталь, диаметр мм',
  },
  {
    id: 'cable',
    match: /кабел|провод/,
    satisfied: /ввг|кг|сечен|мм2|мм²|\d+\s*[xх]\s*\d/,
    question: 'Какой кабель: марка и сечение?',
    placeholder: 'Например ВВГ 3×2.5',
  },
  {
    id: 'paint',
    match: /краск|эмаль|штукатурк/,
    satisfied: /ral|влагостой|фасад|интерьер|акрил|алкид/,
    question: 'Какая краска/материал: тип и цвет?',
    placeholder: 'Фасадная / интерьерная, RAL',
  },
  {
    id: 'tile',
    match: /плитк|керамогранит|кафель/,
    satisfied: /\d+\s*[xх×]\s*\d+|матовая|глянец|керамогранит/,
    question: 'Какая плитка: размер и тип?',
    placeholder: 'Например 60×60, керамогранит',
  },
  {
    id: 'window',
    match: /окн|стеклопакет/,
    satisfied: /пвх|алюмин|дерев|камер|\d+\s*[xх×]\s*\d+/,
    question: 'Какие окна: материал и размер?',
    placeholder: 'ПВХ / алюминий, 1400×1400',
  },
  {
    id: 'metal',
    match: /арматур|швеллер|уголок|лист\s*мет|профнастил|металлопрокат/,
    satisfied: /а500|а400|гост|толщин|\d+\s*мм|марка/,
    question: 'Какой металлопрокат: марка, размер, ГОСТ?',
    placeholder: 'Например арматура А500 12 мм',
  },
];

function corpusOf(result: GeminiAnalyzeResult, extra = '') {
  return [
    result.rawText,
    result.description,
    result.understanding,
    result.quantity,
    extra,
    ...result.items.flatMap((i) => [i.name, i.quantity, i.specs]),
  ]
    .join(' ')
    .toLowerCase();
}

const GREETING_OR_META =
  /^(привет|приветик|здравствуй(те)?|салам|сәлем|hello|hi|hey|добрый\s+(день|вечер|утро)|қайырлы\s+\S+|ок|окей|хорошо|да|нет|жоқ|иә)[\s!.?]*$/i;

const CITY_ONLY = /^(алматы|астана|шымкент|караганда|актобе|атырау)[\s!.?]*$/i;

export function isNotAProduct(name: string) {
  const n = name.trim().toLowerCase();
  if (n.length < 3) return true;
  if (GREETING_OR_META.test(n) || CITY_ONLY.test(n)) return true;
  if (/^(м\s*-?\s*400|м\s*-?\s*500|пока не знаю|әзірге білмеймін)$/i.test(n)) {
    return true;
  }
  return false;
}

export function hasProductSignal(text: string) {
  const t = text.toLowerCase();
  if (SPEC_RULES.some((r) => r.match.test(t))) return true;
  const lines = t
    .split(/[\n.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.some((line) => !isNotAProduct(line) && line.length >= 4);
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-zа-яёәғқңөұүһі0-9]+/gi, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24) || 'item';
}

function isWeakSpec(specs: string) {
  const s = specs.trim().toLowerCase();
  if (!s || s === '—' || s === '-') return true;
  if (/^\d+[\s.,]?\d*\s*(т|тонн|шт|штук|кг|м2|м²|м|мм|см)?$/i.test(s)) return true;
  return s.length < 4;
}

function findRule(text: string) {
  return SPEC_RULES.find((r) => r.match.test(text)) ?? null;
}

function itemsFrom(result: GeminiAnalyzeResult): GeminiRequestItem[] {
  const source = result.items.length
    ? result.items
    : result.title
      ? [
          {
            name: result.title,
            quantity: result.quantity || '',
            specs: '',
            city: result.city || '',
          },
        ]
      : [];
  return source.filter((item) => !isNotAProduct(item.name));
}

function alreadyAsks(questions: GeminiClarifyQuestion[], id: string, name: string) {
  const n = name.toLowerCase();
  return questions.some(
    (q) =>
      q.id === id ||
      (q.field === 'spec' && n && q.question.toLowerCase().includes(n.slice(0, 18))),
  );
}

export function requiredSpecQuestions(
  result: GeminiAnalyzeResult,
  extraAnswers = '',
): GeminiClarifyQuestion[] {
  const corpus = corpusOf(result, extraAnswers);
  const extra: GeminiClarifyQuestion[] = [];

  for (const item of itemsFrom(result)) {
    const blob = `${item.name} ${item.specs} ${corpus}`;
    const rule = findRule(blob);
    const id = rule ? `spec_${rule.id}` : `spec_${slug(item.name)}`;
    const satisfied = rule
      ? rule.satisfied.test(blob)
      : !isWeakSpec(item.specs) && item.specs.trim().length >= 8;

    if (satisfied || alreadyAsks(result.questions, id, item.name)) continue;

    if (rule) {
      extra.push({
        id,
        field: 'spec',
        question: rule.question,
        placeholder: rule.placeholder,
        options: rule.options,
      });
    } else if (!extraAnswers.trim()) {
      extra.push({
        id,
        field: 'spec',
        question: `Какие характеристики нужны для «${item.name}»?`,
        placeholder: 'Марка, размер, материал, модель — то, что нужно поставщику',
      });
    }
  }

  for (const rule of SPEC_RULES) {
    const id = `spec_${rule.id}`;
    if (!rule.match.test(corpus) || rule.satisfied.test(corpus)) continue;
    if (extra.some((q) => q.id === id) || alreadyAsks(result.questions, id, '')) continue;
    extra.push({
      id,
      field: 'spec',
      question: rule.question,
      placeholder: rule.placeholder,
      options: rule.options,
    });
  }

  return extra;
}

function compact(text: string) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function alreadyAsked(askedTexts: string[], question: string) {
  const q = compact(question);
  if (q.length < 8) return false;
  return askedTexts.some((t) => {
    const a = compact(t);
    return a === q || a.includes(q) || q.includes(a.slice(0, 40));
  });
}

function nextContextQuestion(
  result: GeminiAnalyzeResult,
  corpus: string,
): GeminiClarifyQuestion | null {
  if (!result.city && !/(алматы|астана|шымкент)/.test(corpus)) {
    return {
      id: 'city',
      field: 'city',
      question: 'В какой город нужна доставка?',
      options: ['Алматы', 'Астана', 'Шымкент'],
    };
  }
  const hasQty =
    result.quantity &&
    result.quantity !== '—' &&
    /(\d+\s*(т|тонн|шт|штук|кг|мешк))/.test(corpus);
  if (!hasQty) {
    return {
      id: 'quantity',
      field: 'quantity',
      question: 'Сколько нужно — в тоннах или мешках?',
      placeholder: 'Например: 8 тонн или 200 мешков',
    };
  }
  if (!result.deadline || result.deadline === 'Уточнить') {
    if (!/(срок|до\s+\d|завтра|срочно|быстр)/.test(corpus)) {
      return {
        id: 'deadline',
        field: 'deadline',
        question: 'К какому сроку нужно привезти?',
        placeholder: 'Например: до пятницы',
      };
    }
  }
  return null;
}

export function withRequiredSpecQuestions(
  result: GeminiAnalyzeResult,
  extraAnswers = '',
  askedTexts: string[] = [],
): GeminiAnalyzeResult {
  const corpus = corpusOf(result, extraAnswers);
  const productKnown = hasProductSignal(corpus);
  const items = result.items.filter((item) => !isNotAProduct(item.name));
  const extra = productKnown
    ? requiredSpecQuestions({ ...result, items }, extraAnswers)
    : [];

  const questions = [...result.questions, ...extra].filter(
    (q, i, arr) =>
      arr.findIndex((x) => x.id === q.id) === i &&
      !alreadyAsked(askedTexts, q.question),
  );

  if (!productKnown) {
    questions.length = 0;
    questions.push({
      id: 'need',
      field: 'other',
      question: 'Что нужно закупить?',
      placeholder: 'Например: цемент М400 10 тонн, шкафы 4 шт',
    });
  } else if (!questions.length) {
    const follow = nextContextQuestion(result, corpus);
    if (follow && !alreadyAsked(askedTexts, follow.question)) {
      questions.push(follow);
    }
  }

  const next = questions.slice(0, 1);
  let assistantMessage = result.assistantMessage?.trim() ?? '';
  const dumped = compact(result.rawText);
  const echoed = dumped.length > 6 && compact(assistantMessage).includes(dumped);
  const repeated =
    Boolean(assistantMessage) && alreadyAsked(askedTexts, assistantMessage);

  if (!productKnown) {
    const first = (result.rawText.split('\n')[0] ?? '').trim();
    assistantMessage = isNotAProduct(first)
      ? 'Привет! Что нужно закупить — товар или услугу?'
      : 'Что нужно закупить — товар или услугу?';
  } else if (echoed || repeated || !assistantMessage) {
    assistantMessage = next[0]?.question || 'Записал. Могу собрать заявку для поставщиков.';
  }
  if (!next.length && !assistantMessage) {
    assistantMessage = 'Собрал заявку для поставщиков. Можно публиковать.';
  }
  return {
    ...result,
    items,
    questions: next,
    assistantMessage,
    ready: productKnown && next.length === 0,
  };
}
