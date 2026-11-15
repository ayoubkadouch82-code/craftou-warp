# CRAFT WARP — Collaboration protocol

الهدف: صديقان (أو أكثر) يعدّلان نفس المشروع، يريان تعديلات بعضهما، مؤشرات الفأرة، الكائن الذي يعمل
عليه الآخر، ودردشة نصية/صور — كل ذلك عبر رمز من 6 أحرف.

## 1. إنشاء جلسة (host)

```http
POST /api/rooms
→ { "code": "AB3X9K" }
```

ثم يتصل المضيف بـ:

```
ws(s)://<host>/ws?room=AB3X9K&role=host&name=Ayoub
```

عند الاتصال يرسل الخادم:

```json
{
  "t": "welcome", "id": "p1234_1", "name": "Ayoub", "color": "#ff661a",
  "role": "host", "room": "AB3X9K", "revision": 0,
  "peers": [{ "id": "p1234_1", "name": "Ayoub", "color": "#ff661a", "role": "host" }],
  "snapshot": null, "serverTime": 1700000000000
}
```

ثم يبثّ المضيف نسخة كاملة:

```json
{ "t": "state", "project": { "name": "…", "targets": [ … ], "assets": { … } } }
```

الخادم يحتفظ بهذه الرسالة كـ snapshot داخل الغرفة (revision++) ليستقبلها أي منضمّ لاحق.

## 2. الانضمام (guest)

```
ws(s)://<host>/ws?room=AB3X9K&role=guest&name=Sara
```

- إذا كان هناك snapshot → يصل داخل `welcome.snapshot` فيتحمّل المشروع مباشرة.
- إن لم يوجد → يرسل الضيف `{"t":"request-state"}` ويرد المضيف بـ `state`.
- الأخطاء (`bad-room`, `room-not-found`, `host-taken`) تصل كرسالة `error` ثم إغلاق.

## 3. الرسائل

كل رسالة يبثّها العميل يحقن فيها الخادم: `from`, `name`, `color`, `role`, `at`.
(المرسل لا يستقبل رسالته — العملاء يتجاهلون `from === id`.)

| t | payload | المعنى |
|---|---|---|
| `state` | `{project}` | نسخة كاملة؛ الخادم يخزّنها كـ snapshot |
| `request-state` | – | يطلب نسخة كاملة من المضيف |
| `target` | `{target}` | إنشاء/استبدال كائن (لبناته، مظهره، متغيراته… إلخ) |
| `target-remove` | `{id}` | حذف كائن |
| `targets-order` | `{ids}` | ترتيب الطبقات |
| `assets` | `{assets:{ key: {dataUrl, ext} }}` | أصول جديدة (مظاهر/أصوات) |
| `meta` | `{meta:{name}}` | اسم المشروع وبيانات وصفية |
| `cursor` | `{cursor:{sx, sy, sprite}}` | موضع مؤشر الفأرة (بكسل داخل مساحة العمل) + الكائن |
| `chat` | `{text, image}` | رسالة دردشة (صورة = dataURL مصغّر) |
| `activity` | `{text}` | سطر في سجل النشاط |
| `join`/`leave`/`host-left` | `{id,name,role}` | يبثّها الخادم تلقائيًا |

أمثلة:

```json
{ "t": "target", "target": { "id": "sprite_ab12", "name": "Cat", "x": 42, "blocks": {…} } }
{ "t": "chat", "text": "شوف اللبنة الجديدة", "image": "data:image/jpeg;base64,…" }
{ "t": "cursor", "cursor": { "sx": 320, "sy": 180, "sprite": "sprite_ab12" } }
```

## 4. دورة حياة الغرفة

```
POST /api/rooms ──► Room { peers: {}, revision: 0, snapshot: None, tx: broadcast(512) }
host يصل        ──► peers += host ; بث join
guest يصل       ──► يرسل welcome + snapshot (إن وُجد) ; بث join للمضيف
مغادرة          ──► peers -= peer ; بث leave ; إن كان host → بث host-left
الغرفة فارغة    ──► حذفها من الذاكرة (لا ملفات على القرص)
```

- غرفة واحدة = مضيف واحد فقط (`host-taken`).
- الغرف في الذاكرة فقط، وتُفقد عند إعادة تشغيل الخادم (المشروع محفوظ على القرص بشكل مستقل).
- إعادة الاتصال: العميل يحاول 6 مرات بتباعد تصاعدي، ويطلب `state` بعد النجاح.

## 5. التنفيذ على الخادم (Rust)

`src/collab.rs`:

- `AppState.rooms: Arc<Mutex<HashMap<String, Room>>>` — أقفال قصيرة جدًا، ولا يُحفظ القفل عبر `await`.
- `Room.tx: broadcast::Sender<String>` — الرسائل نصوص JSON جاهزة، ترحيل بدون إعادة تسلسل.
- كل عميل يشترك في `broadcast` ويستخدم `tokio::select!` بين `socket.recv()` و`rx.recv()`.
- حد حجم الرسالة 64MB (نسخة كاملة من مشروع بمظاهر كبيرة).
- ألوان المشاركين من قائمة ثابتة، والتسلسل `p<ms>_<n>`.

## 6. حدود وأمان

- الخادم لا يتحقق من محتوى المشروع: أي مشارك يملك رمز الغرفة يمكنه تعديل أي شيء (مثل Google Docs
  بصلاحية تحرير). لا تشارك الرمز علنًا.
- الصور تُصغَّر في المتصفح قبل الإرسال (720px، JPEG).
- الرموز 6 أحرف من أبجدية بلا `0/O/1/I` → ~1 مليار احتمال، والغرف تُحذف عند فراغها.
- للإنتاج: شغّل خلف reverse proxy مع TLS (يُصبح `wss` تلقائيًا في المتصفح).
