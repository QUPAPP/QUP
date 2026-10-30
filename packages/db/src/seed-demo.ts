import { createConnection } from "./client.js";
import { describeTarget, env } from "./env.js";

const EXPECTED_DATABASE = "qup_db";
const DEMO_EXAM_CODE = "DEMO_QUDURAT";

type Sql = ReturnType<typeof createConnection>;

interface DemoQuestion {
  stem: string;
  options: string[];
  correct: number;
  explanation: string;
  difficulty: number;
}

interface DemoSkill {
  code: string;
  name: string;
  questions: DemoQuestion[];
}

interface DemoDomain {
  code: string;
  name: string;
  weight: number;
  skills: DemoSkill[];
}

const OPTION_KEYS = ["A", "B", "C", "D"];

function text(value: string) {
  return { blocks: [{ type: "text", text: value }] };
}

function shuffleAround(correct: number, distractors: number[], seed: number) {
  const values = [correct, ...distractors.filter((value) => value !== correct)].slice(0, 4);
  const position = seed % values.length;
  [values[0], values[position]] = [values[position] as number, values[0] as number];
  return { options: values.map(String), correct: position };
}

function percentQuestions(): DemoQuestion[] {
  const cases = [
    [20, 150],
    [25, 240],
    [15, 300],
    [40, 85],
    [12, 250],
    [35, 140],
    [60, 45],
    [5, 680],
  ] as const;
  return cases.map(([percent, base], index) => {
    const answer = (percent * base) / 100;
    const { options, correct } = shuffleAround(
      answer,
      [answer + 5, answer * 2, Math.max(1, answer - 3), answer + 10],
      index,
    );
    return {
      stem: `كم يساوي ${percent}% من ${base}؟`,
      options,
      correct,
      explanation: `${percent}% من ${base} = ${percent} ÷ 100 × ${base} = ${answer}.`,
      difficulty: 0.3 + (index % 4) * 0.1,
    };
  });
}

function equationQuestions(): DemoQuestion[] {
  const cases = [
    [3, 5, 20],
    [2, 7, 19],
    [5, 4, 39],
    [4, 9, 33],
    [6, 2, 44],
    [7, 3, 52],
    [8, 6, 70],
    [9, 1, 64],
  ] as const;
  return cases.map(([a, b, c], index) => {
    const answer = (c - b) / a;
    const { options, correct } = shuffleAround(
      answer,
      [answer + 1, answer - 1, answer + 2, answer * 2],
      index + 1,
    );
    return {
      stem: `إذا كان ${a}س + ${b} = ${c}، فما قيمة س؟`,
      options,
      correct,
      explanation: `نطرح ${b} من الطرفين فيصبح ${a}س = ${c - b}، ثم نقسم على ${a} فتكون س = ${answer}.`,
      difficulty: 0.35 + (index % 4) * 0.1,
    };
  });
}

function geometryQuestions(): DemoQuestion[] {
  const rectangles = [
    [6, 4],
    [9, 5],
    [12, 3],
    [7, 7],
  ] as const;
  const triangles = [
    [40, 75],
    [55, 65],
    [30, 90],
    [48, 62],
  ] as const;
  const area = rectangles.map(([length, width], index) => {
    const answer = length * width;
    const { options, correct } = shuffleAround(
      answer,
      [2 * (length + width), answer + length, answer - width, answer + 6],
      index + 2,
    );
    return {
      stem: `مستطيل طوله ${length} سم وعرضه ${width} سم، فما مساحته بالسنتيمتر المربع؟`,
      options,
      correct,
      explanation: `مساحة المستطيل = الطول × العرض = ${length} × ${width} = ${answer} سم².`,
      difficulty: 0.3 + index * 0.1,
    };
  });
  const angles = triangles.map(([first, second], index) => {
    const answer = 180 - first - second;
    const { options, correct } = shuffleAround(
      answer,
      [answer + 10, 360 - first - second, answer - 5, answer + 20],
      index + 3,
    );
    return {
      stem: `مثلث قياس زاويتين فيه ${first}° و${second}°، فما قياس الزاوية الثالثة؟`,
      options,
      correct,
      explanation: `مجموع زوايا المثلث 180°، فالزاوية الثالثة = 180 − ${first} − ${second} = ${answer}°.`,
      difficulty: 0.4 + index * 0.1,
    };
  });
  return [...area, ...angles];
}

const ANALOGIES: DemoQuestion[] = [
  {
    stem: "اختر الزوج الذي تشبه العلاقة بين طرفيه العلاقة في: قلم : كتابة",
    options: ["مقص : قص", "كتاب : مكتبة", "ورقة : شجرة", "حبر : لون"],
    correct: 0,
    explanation: "العلاقة أداة ووظيفتها: القلم أداة الكتابة كما أن المقص أداة القص.",
    difficulty: 0.3,
  },
  {
    stem: "اختر الزوج الذي تشبه العلاقة بين طرفيه العلاقة في: طبيب : مستشفى",
    options: ["مريض : دواء", "معلم : مدرسة", "سيارة : طريق", "كتاب : قارئ"],
    correct: 1,
    explanation: "العلاقة مهنة ومكان عملها: الطبيب يعمل في المستشفى والمعلم في المدرسة.",
    difficulty: 0.3,
  },
  {
    stem: "اختر الزوج الذي تشبه العلاقة بين طرفيه العلاقة في: بذرة : شجرة",
    options: ["نهر : بحر", "ماء : ثلج", "بيضة : طائر", "غصن : ورقة"],
    correct: 2,
    explanation: "العلاقة أصل وما يتحول إليه: البذرة تصير شجرة والبيضة تصير طائرًا.",
    difficulty: 0.45,
  },
  {
    stem: "اختر الزوج الذي تشبه العلاقة بين طرفيه العلاقة في: عطش : ماء",
    options: ["جوع : طعام", "نوم : سرير", "برد : شتاء", "تعب : عمل"],
    correct: 0,
    explanation: "العلاقة حاجة وما يسدها: الماء يروي العطش والطعام يسد الجوع.",
    difficulty: 0.4,
  },
  {
    stem: "اختر الزوج الذي تشبه العلاقة بين طرفيه العلاقة في: قطرة : مطر",
    options: ["رمل : صحراء", "سطر : كتاب", "حبة : رمل", "نجمة : سماء"],
    correct: 2,
    explanation: "العلاقة جزء وكل من جنسه: القطرة وحدة المطر والحبة وحدة الرمل.",
    difficulty: 0.6,
  },
  {
    stem: "اختر الزوج الذي تشبه العلاقة بين طرفيه العلاقة في: شجاعة : جبن",
    options: ["كرم : بخل", "ذكاء : فطنة", "صدق : أمانة", "قوة : صلابة"],
    correct: 0,
    explanation: "العلاقة تضاد: الشجاعة ضد الجبن والكرم ضد البخل.",
    difficulty: 0.35,
  },
  {
    stem: "اختر الزوج الذي تشبه العلاقة بين طرفيه العلاقة في: ميزان : وزن",
    options: ["ساعة : وقت", "مسطرة : قلم", "ترمومتر : مرض", "بوصلة : خريطة"],
    correct: 0,
    explanation: "العلاقة أداة وما تقيسه: الميزان يقيس الوزن والساعة تقيس الوقت.",
    difficulty: 0.5,
  },
  {
    stem: "اختر الزوج الذي تشبه العلاقة بين طرفيه العلاقة في: فصل : رواية",
    options: ["ممثل : مسرح", "مشهد : مسرحية", "شاعر : قصيدة", "صفحة : قلم"],
    correct: 1,
    explanation: "العلاقة جزء من كل: الفصل جزء من الرواية والمشهد جزء من المسرحية.",
    difficulty: 0.65,
  },
];

const COMPLETIONS: DemoQuestion[] = [
  {
    stem: "من جدّ ........ ومن زرع حصد.",
    options: ["وجد", "تعب", "نام", "ندم"],
    correct: 0,
    explanation: "المثل المعروف «من جدّ وجد»، والجملة تربط الجهد بثمرته.",
    difficulty: 0.25,
  },
  {
    stem: "كان الطالب ........ في مذاكرته، فحقق أعلى الدرجات.",
    options: ["متهاونًا", "مجتهدًا", "مترددًا", "متأخرًا"],
    correct: 1,
    explanation: "النتيجة «أعلى الدرجات» تدل على صفة إيجابية، وهي الاجتهاد.",
    difficulty: 0.3,
  },
  {
    stem: "رغم ........ الطريق، وصل المسافرون في الموعد.",
    options: ["قصر", "سهولة", "وعورة", "جمال"],
    correct: 2,
    explanation: "«رغم» تدل على مفارقة، فالمناسب صفة تُصعّب الوصول وهي الوعورة.",
    difficulty: 0.45,
  },
  {
    stem: "العلم في الصغر ........ على الحجر.",
    options: ["كالنقش", "كالمطر", "كالظل", "كالريح"],
    correct: 0,
    explanation: "المثل «العلم في الصغر كالنقش على الحجر» يشير إلى رسوخه.",
    difficulty: 0.35,
  },
  {
    stem: "لا تؤجل عمل اليوم إلى ........",
    options: ["الأمس", "الغد", "المساء", "الأبد"],
    correct: 1,
    explanation: "الحكمة المعروفة تحث على إنجاز العمل في وقته وعدم تأجيله إلى الغد.",
    difficulty: 0.2,
  },
  {
    stem: "كلما ازداد الإنسان علمًا ازداد ........",
    options: ["غرورًا", "تواضعًا", "كسلًا", "عزلة"],
    correct: 1,
    explanation: "المعنى المقصود أن العلم الحقيقي يورث التواضع.",
    difficulty: 0.5,
  },
  {
    stem: "أثبتت التجربة أن الفرضية ........، فأعاد الباحث صياغتها.",
    options: ["صحيحة", "خاطئة", "مكتملة", "مقبولة"],
    correct: 1,
    explanation: "إعادة الصياغة تكون بعد ثبوت خطأ الفرضية لا صحتها.",
    difficulty: 0.55,
  },
  {
    stem: "اتسم أسلوب الكاتب بـ........، فلم يحتج القارئ إلى إعادة قراءة النص.",
    options: ["الغموض", "التعقيد", "الوضوح", "الإطالة"],
    correct: 2,
    explanation: "عدم الحاجة لإعادة القراءة نتيجة طبيعية لوضوح الأسلوب.",
    difficulty: 0.6,
  },
];

const CONTEXT_ERRORS: DemoQuestion[] = [
  {
    stem: "حدّد الكلمة التي لا يستقيم بها المعنى: «الصبر مفتاح الفشل، ومن صبر نال ما يريد».",
    options: ["الصبر", "مفتاح", "الفشل", "نال"],
    correct: 2,
    explanation: "الصبر مفتاح الفرج لا الفشل، والجملة الثانية تؤكد أن الصبر يقود للنجاح.",
    difficulty: 0.35,
  },
  {
    stem: "حدّد الكلمة غير المناسبة: «يكثر المطر في الصحراء فتجف الأرض وتقل النباتات».",
    options: ["يكثر", "الصحراء", "تجف", "النباتات"],
    correct: 0,
    explanation: "جفاف الأرض وقلة النبات نتيجة قلة المطر لا كثرته.",
    difficulty: 0.45,
  },
  {
    stem: "حدّد الكلمة غير المناسبة: «نام الطالب مبكرًا ليستيقظ متعبًا لأداء الاختبار».",
    options: ["نام", "مبكرًا", "متعبًا", "الاختبار"],
    correct: 2,
    explanation: "النوم المبكر يهدف إلى الاستيقاظ نشيطًا لا متعبًا.",
    difficulty: 0.4,
  },
  {
    stem: "حدّد الكلمة غير المناسبة: «الشمس تغرب من الشرق وتشرق من الغرب كل يوم».",
    options: ["تغرب", "الشرق", "تشرق", "يوم"],
    correct: 1,
    explanation: "الشمس تشرق من الشرق وتغرب في الغرب؛ فالخطأ في موضع «الشرق».",
    difficulty: 0.55,
  },
  {
    stem: "حدّد الكلمة غير المناسبة: «القراءة تضيّق آفاق القارئ وتثري معارفه».",
    options: ["القراءة", "تضيّق", "تثري", "معارفه"],
    correct: 1,
    explanation: "القراءة توسّع الآفاق، و«تثري معارفه» تؤكد أن المعنى إيجابي.",
    difficulty: 0.3,
  },
  {
    stem: "حدّد الكلمة غير المناسبة: «أسرع السائق في المنعطف حرصًا على سلامة الركاب».",
    options: ["أسرع", "المنعطف", "حرصًا", "سلامة"],
    correct: 0,
    explanation: "الحرص على السلامة يقتضي التمهل في المنعطف لا الإسراع.",
    difficulty: 0.5,
  },
  {
    stem: "حدّد الكلمة غير المناسبة: «اشتهر حاتم الطائي بالبخل حتى ضُرب به المثل في الجود».",
    options: ["اشتهر", "البخل", "المثل", "الجود"],
    correct: 1,
    explanation: "حاتم الطائي مثل في الكرم، والجملة نفسها تذكر الجود.",
    difficulty: 0.6,
  },
  {
    stem: "حدّد الكلمة غير المناسبة: «تجمّد الماء حين ارتفعت درجة الحرارة فوق المئة».",
    options: ["تجمّد", "الماء", "ارتفعت", "المئة"],
    correct: 0,
    explanation: "الماء يغلي عند تجاوز مئة درجة ولا يتجمد.",
    difficulty: 0.65,
  },
];

const DOMAINS: DemoDomain[] = [
  {
    code: "VERBAL",
    name: "القسم اللفظي",
    weight: 1,
    skills: [
      { code: "VERBAL-ANALOGY", name: "التناظر اللفظي", questions: ANALOGIES },
      { code: "VERBAL-COMPLETION", name: "إكمال الجمل", questions: COMPLETIONS },
      { code: "VERBAL-CONTEXT", name: "الخطأ السياقي", questions: CONTEXT_ERRORS },
    ],
  },
  {
    code: "QUANT",
    name: "القسم الكمي",
    weight: 1,
    skills: [
      { code: "QUANT-ARITHMETIC", name: "النسب المئوية", questions: percentQuestions() },
      { code: "QUANT-ALGEBRA", name: "المعادلات الخطية", questions: equationQuestions() },
      { code: "QUANT-GEOMETRY", name: "الهندسة", questions: geometryQuestions() },
    ],
  },
];

async function single<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  if (!row) throw new Error("Expected a row");
  return row;
}

async function insertQuestion(
  sql: Sql,
  versionId: string,
  skillId: string,
  code: string,
  question: DemoQuestion,
): Promise<void> {
  const created = await single(sql<{ id: string }[]>`
    INSERT INTO questions (stable_code) VALUES (${code}) RETURNING id`);
  const version = await single(sql<{ id: string }[]>`
    INSERT INTO question_versions
      (question_id, version_number, question_type, stem_content, explanation_content,
       difficulty_author_score, taxonomy_version_id, source_type, source_reference)
    VALUES (${created.id}, 1, 'SINGLE_CHOICE', ${sql.json(text(question.stem))},
            ${sql.json(text(question.explanation))}, ${question.difficulty}, ${versionId},
            'DEMO', 'seed-demo')
    RETURNING id`);
  for (const [index, option] of question.options.entries()) {
    await sql`
      INSERT INTO question_options (question_version_id, key, content, is_correct, display_order)
      VALUES (${version.id}, ${OPTION_KEYS[index] as string}, ${sql.json(text(option))},
              ${index === question.correct}, ${index})`;
  }
  await sql`
    INSERT INTO question_skill_mappings (question_version_id, skill_id, role, attribution_weight)
    VALUES (${version.id}, ${skillId}, 'PRIMARY', 1)`;
  for (const status of ["UNDER_REVIEW", "APPROVED"]) {
    await sql`
      UPDATE question_versions SET status = ${status}::question_version_status
      WHERE id = ${version.id}`;
  }
  await sql`
    UPDATE question_versions SET status = 'PUBLISHED', published_at = now()
    WHERE id = ${version.id}`;
}

async function seed(sql: Sql): Promise<void> {
  const existing = await sql`SELECT 1 FROM exams WHERE code = ${DEMO_EXAM_CODE}`;
  if (existing.length > 0) {
    console.log("Demo exam already present; nothing to do.");
    return;
  }

  await sql.begin(async (tx) => {
    const db = tx as unknown as Sql;
    const exam = await single(db<{ id: string }[]>`
      INSERT INTO exams (code, slug, name_ar, name_en, description, status)
      VALUES (${DEMO_EXAM_CODE}, 'demo-qudurat', 'اختبار القدرات العامة (تجريبي)',
              'General Aptitude (demo)',
              'محتوى تجريبي لتجربة المنصة محليًا: قسم لفظي وقسم كمي بثلاث مهارات لكل قسم.',
              'ACTIVE')
      RETURNING id`);
    const version = await single(db<{ id: string }[]>`
      INSERT INTO taxonomy_versions (exam_id, version_code)
      VALUES (${exam.id}, 'demo-v1') RETURNING id`);

    const skillIds = new Map<string, string>();
    for (const [domainIndex, domain] of DOMAINS.entries()) {
      const createdDomain = await single(db<{ id: string }[]>`
        INSERT INTO domains (taxonomy_version_id, code, name, weight, display_order)
        VALUES (${version.id}, ${domain.code}, ${domain.name}, ${domain.weight}, ${domainIndex})
        RETURNING id`);
      for (const [skillIndex, skill] of domain.skills.entries()) {
        const createdSkill = await single(db<{ id: string }[]>`
          INSERT INTO skills (domain_id, code, name, min_coverage, display_order)
          VALUES (${createdDomain.id}, ${skill.code}, ${skill.name}, 3, ${skillIndex})
          RETURNING id`);
        skillIds.set(skill.code, createdSkill.id);
      }
    }
    await db`UPDATE taxonomy_versions SET status = 'PUBLISHED' WHERE id = ${version.id}`;

    for (const domain of DOMAINS) {
      for (const skill of domain.skills) {
        const skillId = skillIds.get(skill.code) as string;
        for (const [index, question] of skill.questions.entries()) {
          await insertQuestion(db, version.id, skillId, `${skill.code}-${index + 1}`, question);
        }
      }
    }

    await db`
      INSERT INTO plans (exam_id, code, name, price_minor, currency, duration_days, status)
      VALUES (${exam.id}, 'DEMO_QUDURAT_90', 'باقة القدرات التجريبية — 90 يومًا', 19900, 'SAR', 90,
              'ACTIVE')`;
  });

  const total = DOMAINS.reduce(
    (sum, domain) =>
      sum + domain.skills.reduce((count, skill) => count + skill.questions.length, 0),
    0,
  );
  console.log(`Demo exam seeded with ${total} published questions and one active plan.`);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo content with NODE_ENV=production.");
  }
  const sql = createConnection(env.DATABASE_URL, { maxConnections: 1 });
  try {
    const [target] = await sql<{ database: string }[]>`SELECT current_database() AS database`;
    if (target?.database !== EXPECTED_DATABASE) {
      throw new Error(
        `Refusing to seed: connected to "${target?.database}", expected "${EXPECTED_DATABASE}".`,
      );
    }
    console.log(`Seeding demo content into ${describeTarget()} …`);
    await seed(sql);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
