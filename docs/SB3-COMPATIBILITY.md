# CRAFT WARP — توافق Scratch 3 (.sb3)

## الاستيراد

- يقرأ `project.json` من أرشيف ZIP (يدعم `stored` و`deflate`).
- كل ملف أصل (`<md5>.svg|png|jpg|wav|mp3`) يتحول إلى `dataUrl` داخل `project.assets` بمفتاح `md5.ext`.
- الكائنات → `project.targets` (المسرح أولًا دائمًا).
- المتغيرات والقوائم والرسائل تُنقل كما هي (ids تُحفظ).
- اللبنات: تبقى نفس الـ `opcode` و`inputs` و`fields` و`mutation`.
- **قوائم سكراتش (shadow menu blocks)** تُطوى إلى حقول قابلة للتحرير:
  `motion_goto_menu`, `looks_costume`, `looks_backdrops`, `sound_sounds_menu`,
  `control_create_clone_of_menu`, `sensing_touchingobjectmenu`, `sensing_distancetomenu`,
  `sensing_of_object_menu` … ويُعاد توليدها عند التصدير.
- القيم المضمّنة من نوع broadcast `[1,[11,name,id]]` تُخزَّن كحقل ثم تُعاد عند التصدير.
- monitors وextensions تُنقل كما هي.

## التصدير

- `project.json` + كل الأصول المُشار إليها بأسمائها الأصلية `md5.ext`.
- اسم الأصل = MD5 الحقيقي للبايتات (مُتحقَّق منه في الاختبارات مقابل `node:crypto`).
- تُعاد قوائم sكراتش كبلنات shadow مع `parent` و`shadow: true`.
- اللبنات المخصصة تُصدَّر مع `procedures_prototype` و`procedures_definition` و`procedures_call`
  و`mutation` كاملة (proccode/argumentids/argumentnames/argumentdefaults/warp).
- الحقول الإضافية الخاصة بـ CRAFT WARP (`effects`, `say`, `dragMode`, `id`) لا تُصدَّر.

نتيجة: ملف `.sb3` يُفتح في Scratch 3 وTurboWarp مع السكربتات والمظاهر والأصوات.

## جدول التغطية

| فئة سكراتش | الحالة |
|---|---|
| Motion (18) | ✅ كامل |
| Looks (21) | ✅ كامل (المؤثرات: ghost/brightness/color مطبقة فعليًا، fisheye/whirl/pixelate/mosaic تُحفظ لكن بلا رسم) |
| Sound (9) | ✅ (pitch/pan يُحفظان، لا يُطبَّقان) |
| Events (8) | ✅ كامل |
| Control (12) | ✅ (بما فيها clones وwarp وstop) |
| Sensing (18) | ✅ عدا `touching color`/`color is touching color` → ترجع false (لا يوجد اختبار بكسل) |
| Operators (18) | ✅ كامل |
| Variables & Lists (13) | ✅ كامل |
| My Blocks | ✅ لبنات مخصصة بمدخلات و`warp` واستدعاء متكرر |
| Pen / Music / Video / TTS | ❌ غير مدعومة (تُحفظ اللبنات لكن لا تُنفَّذ) |

## ملاحظات مهمة

- **اللبنات غير المعروفة لا تُحذف** عند الاستيراد/التصدير، لكنها تُرسم بشكل عام وتُتجاهَل عند التنفيذ.
- الحسابات الرقمية تتبع سكراتش تقريبًا (تحويلات `Number`، مقارنات نصية غير حساسة لحالة الأحرف).
- `timer`, `days since 2000`, `username` تُنفَّذ بسلوك مقارب.
- الشاشة 480×360 ثابتة كما في سكراتش.
- التصدير يستخدم `stored` (بدون ضغط) افتراضيًا لتفادي أي مشاكل توافق، مع إمكانية `compress: true`.

## فروق مقصودة

| الموضوع | سكراتش | CRAFT WARP |
|---|---|---|
| شكل اللبنات | SVG/HTML5 | SVG مولّد بنفس الهندسة |
| الأصوات | ملفات CDN | بيانات محلية + موالفات WebAudio للمكتبة |
| المشاركة | مشاريع سحابية | ملف/خادم محلي + تعاون مباشر بالرمز |
| لغة واجهة اللبنات | مترجمة | إنجليزية (تُبقي opcodes متوافقة) والواجهة عربية/إنجليزية |
