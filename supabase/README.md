# Supabase — سير العمل

## الترتيب
1. `0001_schema.sql` الجداول + المحفّزات + `can_read_task()`.
2. `0002_policies.sql` تفعيل RLS + السياسات + النشر للـ Realtime.

## اختبار RLS (يُشغَّل في SQL Editor أو عبر supabase CLI قبل أي دعوة)
```sql
begin;
-- اختر هوية (استبدل <uuid> بمعرّف مستخدم حقيقي من auth.users)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<admin-uuid>","role":"authenticated"}', true);
-- المدير: يقرأ ويكتب داخل منظمته؛ منظمة أخرى = 0 صفوف / رفض
select count(*) from tasks;                 -- كل مهام منظمته
-- المبدع:
select set_config('request.jwt.claims', '{"sub":"<creative-uuid>","role":"authenticated"}', true);
select count(*) from tasks;                 -- مهامه فقط (مالك أو له جزء)
update tasks set start_date = start_date + 1 where id = '<task>';   -- يجب أن يفشل
update task_parts set done = true where id = '<own-part>';           -- ينجح
update task_parts set done = true where id = '<others-part>';        -- يفشل
-- العميل:
select set_config('request.jwt.claims', '{"sub":"<client-uuid>","role":"authenticated"}', true);
select count(*) from tasks;                 -- تقويمه فقط
select count(*) from profiles;              -- المدراء + مستخدمو عميله فقط
insert into messages (org_id, channel, sender_id, body) values ('<org>', 'team', '<client-uuid>', 'x'); -- يفشل
rollback;
```
كل سطر «يفشل» يجب أن يرفع خطأ RLS؛ أي نجاح غير متوقع = لا نطلق.

## ما زال غير مكتوب (يُكتب في خطوة الربط)
- `invite_user(email, role, client_id)` RPC (security definer، للمدير فقط) + جدول `invitations` بصلاحية ومدة انتهاء.
- `handle_new_user` trigger على `auth.users`: ينشئ `profiles` + `user_settings` من سجل الدعوة فقط.
- بذرة الإنتاج (منظمة + أول مدير).
- `createSupabaseRepo()` في `src/data/`: تحميل كامل للمهام/الأجزاء المصرّح بها (مع ترقيم داخلي حتى الاكتمال)، دمج تغييرات Realtime صفاً صفاً، تحديثات مشروطة بالإصدار مع إعادة جلب عند التعارض.
