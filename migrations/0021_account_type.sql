-- Foydalanuvchi roli: teacher (O‘qituvchi/Markaz) yoki learner (O‘quvchi/Abituriyent)
ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'teacher' CHECK(account_type IN ('teacher', 'learner'));
