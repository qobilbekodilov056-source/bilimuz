import { z } from "zod";
export const levels = ["easy", "medium", "hard", "expert"] as const;
export const kinds = ["single", "multiple", "truefalse", "code"] as const;
export const levelNames: Record<string, string> = {
  easy: "Oson",
  medium: "O‘rtacha",
  hard: "Qiyin",
  expert: "Ekspert",
};
export const kindNames: Record<string, string> = {
  single: "Bitta javob",
  multiple: "Bir nechta javob",
  truefalse: "To‘g‘ri / noto‘g‘ri",
  code: "Kodli savol",
};
export const questionSchema = z
  .object({
    title: z.string().trim().min(5).max(5000),
    category: z.string().trim().min(1).max(100),
    topic: z.string().trim().max(120).default(""),
    level: z.enum(levels).default("medium"),
    kind: z.enum(kinds).default("single"),
    code: z.string().max(12000).default(""),
    image_url: z.string().max(400).default(""),
    explanation: z.string().max(5000).default(""),
    points: z.number().finite().positive().max(100).default(1),
    options: z
      .array(
        z
          .object({
            id: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
            text: z.string().trim().min(1).max(2000),
          })
          .strict(),
      )
      .min(2)
      .max(8),
    correct: z.array(z.string()).min(1).max(8),
  })
  .strict()
  .superRefine((q, c) => {
    const ids = q.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length)
      c.addIssue({
        code: "custom",
        path: ["options"],
        message: "Variant ID takrorlangan",
      });
    if (
      new Set(q.correct).size !== q.correct.length ||
      q.correct.some((x) => !ids.includes(x))
    )
      c.addIssue({
        code: "custom",
        path: ["correct"],
        message: "To‘g‘ri javob mavjud variantga mos bo‘lsin",
      });
    if (q.kind !== "multiple" && q.correct.length !== 1)
      c.addIssue({
        code: "custom",
        path: ["correct"],
        message: "Bitta to‘g‘ri javob kerak",
      });
    if (q.kind === "truefalse" && q.options.length !== 2)
      c.addIssue({
        code: "custom",
        path: ["options"],
        message: "To‘g‘ri/noto‘g‘ri uchun ikkita variant kerak",
      });
  });
export type Question = z.infer<typeof questionSchema>;
export const cardSchema = z
  .object({
    title: z.string().trim().min(3).max(130),
    description: z.string().max(1200).default(""),
    reward: z.string().max(500).default(""),
    reward_coins: z.number().int().min(0).max(5000).default(0),
    category: z.string().max(100).default(""),
    topic: z.string().max(120).default(""),
    mode: z.enum(["auto", "manual"]).default("auto"),
    selected_ids: z.array(z.string().max(80)).max(150).default([]),
    mix: z
      .object({
        easy: z.number().min(0).max(100),
        medium: z.number().min(0).max(100),
        hard: z.number().min(0).max(100),
        expert: z.number().min(0).max(100),
      })
      .default({ easy: 30, medium: 50, hard: 20, expert: 0 }),
    question_count: z.number().int().min(1).max(150).default(10),
    duration_minutes: z.number().int().min(1).max(360).default(20),
    pass_percent: z.number().min(0).max(100).default(70),
    attempt_limit: z.number().int().min(1).max(100).default(1),
    random_order: z.boolean().default(true),
    shuffle_options: z.boolean().default(true),
    show_results: z.boolean().default(true),
    show_answers: z.boolean().default(false),
    show_leaderboard: z.boolean().default(false),
    anti_cheat: z.enum(["off", "monitor", "strict"]).default("monitor"),
    max_violations: z.number().int().min(1).max(20).default(3),
    require_fullscreen: z.boolean().default(false),
    access_mode: z.enum(["open", "pin"]).default("open"),
    pin: z.string().max(32).default(""),
    group_id: z.string().max(80).nullable().default(null),
    starts_at: z.number().int().nonnegative().nullable().default(null),
    ends_at: z.number().int().nonnegative().nullable().default(null),
  })
  .strict()
  .superRefine((x, c) => {
    if (
      x.mode === "manual" &&
      new Set(x.selected_ids).size !== x.question_count
    )
      c.addIssue({
        code: "custom",
        path: ["selected_ids"],
        message: "Tanlangan savollar soni limitga teng bo‘lsin",
      });
    if (
      x.mode === "auto" &&
      Object.values(x.mix).reduce((a, b) => a + b, 0) !== 100
    )
      c.addIssue({
        code: "custom",
        path: ["mix"],
        message: "Ulushlar yig‘indisi 100% bo‘lsin",
      });
    if (x.starts_at && x.ends_at && x.starts_at >= x.ends_at)
      c.addIssue({
        code: "custom",
        path: ["ends_at"],
        message: "Tugash boshlanishdan keyin bo‘lsin",
      });
    if (x.show_answers && !x.show_results)
      c.addIssue({
        code: "custom",
        path: ["show_answers"],
        message: "Yashirin natijada javoblarni ochib bo‘lmaydi",
      });
  });
export type CardSettings = z.infer<typeof cardSchema>;
export const registrationSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(8).max(16),
    display_name: z.string().trim().min(3).max(120),
    workplace: z.string().max(160).default(""),
    account_type: z.enum(["teacher", "learner"]).default("teacher"),
    ref: z.string().trim().max(64).optional().default(""),
    consent: z.literal(true),
    turnstile_token: z.string().max(2048),
  })
  .strict();
export const groupSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().max(500).default(""),
  })
  .strict();
export const studentSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    student_code: z.string().trim().max(64).optional().default(""),
    group_id: z.string().max(80).nullable().default(null),
    note: z.string().trim().max(200).optional().default(""),
  })
  .strict();
export const answerSchema = z
  .object({
    answers: z
      .array(
        z
          .object({
            position: z.number().int().min(1).max(150),
            selected: z.array(z.string().max(32)).max(8),
            revision: z.number().int().min(1).max(1e9),
            active_time_ms: z.number().int().min(0).max(21600000).default(0),
          })
          .strict(),
      )
      .min(1)
      .max(150),
  })
  .strict();
