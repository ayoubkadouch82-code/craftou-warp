/**
 * CRAFT WARP — tiny i18n layer (Arabic first, English fallback).
 * Block labels stay in English so .sb3 opcodes map 1:1, but every piece of
 * editor chrome is translated and the whole UI flips to RTL.
 */
const DICT = {
  ar: {
    appName: 'CRAFT WARP',
    file: 'ملف', edit: 'تعديل', collab: 'تعاون', help: 'مساعدة',
    newProject: 'مشروع جديد', openLocal: 'فتح من الجهاز…', saveLocal: 'حفظ على هذا الجهاز',
    saveServer: 'حفظ في الخادم', openServer: 'مشاريع الخادم…', downloadSb3: 'تصدير ملف .sb3',
    importFile: 'استيراد مشروع…', exportJson: 'تصدير JSON', rename: 'إعادة تسمية',
    undo: 'تراجع', redo: 'إعادة', deleteBlocks: 'حذف اللبنات…',
    startCollab: 'بدء جلسة تعاون', joinCollab: 'الانضمام بجلسة', leaveCollab: 'إنهاء الجلسة',
    shareCode: 'رمز المشاركة', copy: 'نسخ', copied: 'تم النسخ',
    host: 'المضيف', guest: 'ضيف', you: 'أنت', people: 'المشاركون',
    hostTitle: 'أنشئ جلسة وشارك الرمز', hostDesc: 'أنت المضيف: ستظهر لك التعليمات والرمز لمشاركته مع أصدقائك.',
    guestTitle: 'انضم إلى صديق', guestDesc: 'اكتب الرمز الذي أعطاك إياه المضيف.',
    createSession: 'إنشاء جلسة', enterCode: 'اكتب الرمز', join: 'انضم',
    dragHere: 'اسحب هنا لحذف اللبنات',
    sprites: 'الكائنات', sprite: 'الكائن', stage: 'الخلفية',
    code: 'اللبنات', costumes: 'المظاهر', sounds: 'الأصوات', team: 'الفريق',
    codeHint: 'اسحب اللبنات إلى مساحة العمل لبناء السكربت.',
    chat: 'الدردشة', chatEmpty: 'لا رسائل بعد — أرسل تحية لفريقك!',
    send: 'إرسال', downloadExe: 'تحميل CRAFT WARP.exe',
    save: 'حفظ', import: 'استيراد', saved: 'محفوظ', saving: 'جارٍ الحفظ…', unsaved: 'تغييرات غير محفوظة',
    ready: 'جاهز', engine: 'المحرك: Rust',
    chooseSprite: 'اختر كائنًا', chooseBackdrop: 'اختر خلفية', chooseSound: 'اختر صوتًا',
    addFromLibrary: 'من المكتبة', upload: 'رفع ملف', duplicate: 'تكرار', del: 'حذف',
    paint: 'رسم', library: 'المكتبة', animals: 'حيوانات', fantasy: 'خيال', items: 'أشياء',
    backdrops: 'الخلفيات', soundLib: 'أصوات', music: 'موسيقى',
    newSprite: 'كائن جديد', newBackdrop: 'خلفية جديدة', newSound: 'صوت جديد',
    projectName: 'اسم المشروع', confirmDelete: 'هل تريد الحذف؟',
    collabLive: 'جلسة مباشرة', collabEnded: 'انتهت الجلسة',
    hostLeft: 'غادر المضيف الجلسة', roomNotFound: 'لم يُعثر على جلسة بهذا الرمز',
    nameLabel: 'اسمك', namePlaceholder: 'اكتب اسمك',
    welcome: 'مرحبًا بك في CRAFT WARP', welcomeBody: 'محرر لبنات خفيف وسريع يعمل على Rust، يستورد ويفتح مشاريع سكراتش (.sb3) ويصدّرها، ويحتوي مكتبة كائنات وأصوات وخلفيات، مع تعاون مباشر عبر رمز.',
    about: 'حول البرنامج', docs: 'دليل الاستخدام', shortcut: 'اختصارات',
    connected: 'متصل', disconnected: 'غير متصل', connecting: 'جارٍ الاتصال…',
    guests: 'الضيوف', noCollab: 'لست في جلسة تعاون',
    activityJoin: 'انضم إلى الجلسة', activityLeave: 'غادر الجلسة', activitySprite: 'عدّل الكائن',
    activityBlocks: 'حرّك اللبنات', activityChat: 'أرسل رسالة', activityCostume: 'غيّر المظهر',
    exeHint: 'زر التحميل أسفل الشاشة يجلب أحدث إصدار من صفحة الإصدارات (releases).',
    loading: 'جارٍ التحميل…', projectLoaded: 'تم تحميل المشروع', sb3Imported: 'تم استيراد مشروع سكراتش',
    errorImport: 'تعذر استيراد الملف', savedServer: 'تم الحفظ في الخادم', noServer: 'الخادم غير متاح',
    nothingHere: 'لا يوجد شيء هنا بعد', selectSprite: 'اختر كائنًا للبدء',
    variables: 'المتغيرات', myBlocks: 'لبناتي', makeVar: 'إنشاء متغير', makeList: 'إنشاء قائمة',
    noCostumes: 'لا مظاهر — أضف مظهرًا من المكتبة', noSounds: 'لا أصوات — أضف صوتًا من المكتبة',
    playSound: 'تشغيل', stopAll: 'إيقاف الكل', clear: 'مسح',
    unsupported: 'العنصر غير مدعوم في هذا المتصفح',
    reconnect: 'إعادة الاتصال', hostingSince: 'بدأت الجلسة', codeCopied: 'تم نسخ الرمز',
  },
  en: {
    appName: 'CRAFT WARP',
    file: 'File', edit: 'Edit', collab: 'Collaborate', help: 'Help',
    newProject: 'New project', openLocal: 'Open from computer…', saveLocal: 'Save to this computer',
    saveServer: 'Save to server', openServer: 'Server projects…', downloadSb3: 'Export .sb3',
    importFile: 'Import project…', exportJson: 'Export JSON', rename: 'Rename',
    undo: 'Undo', redo: 'Redo', deleteBlocks: 'Delete blocks…',
    startCollab: 'Host a session', joinCollab: 'Join a session', leaveCollab: 'End session',
    shareCode: 'Session code', copy: 'Copy', copied: 'Copied',
    host: 'Host', guest: 'Guest', you: 'you', people: 'People',
    hostTitle: 'Host and share the code', hostDesc: 'You are the host: share the code below with your friends.',
    guestTitle: 'Join a friend', guestDesc: 'Type the code your friend gave you.',
    createSession: 'Create session', enterCode: 'Enter code', join: 'Join',
    dragHere: 'Drag blocks here to delete',
    sprites: 'Sprites', sprite: 'Sprite', stage: 'Stage',
    code: 'Code', costumes: 'Costumes', sounds: 'Sounds', team: 'Team',
    codeHint: 'Drag blocks into the workspace to build a script.',
    chat: 'Chat', chatEmpty: 'No messages yet — say hi to your team!',
    send: 'Send', downloadExe: 'Download CRAFT WARP.exe',
    save: 'Save', import: 'Import', saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved changes',
    ready: 'Ready', engine: 'Engine: Rust',
    chooseSprite: 'Choose a Sprite', chooseBackdrop: 'Choose a Backdrop', chooseSound: 'Choose a Sound',
    addFromLibrary: 'From library', upload: 'Upload', duplicate: 'Duplicate', del: 'Delete',
    paint: 'Paint', library: 'Library', animals: 'Animals', fantasy: 'Fantasy', items: 'Things',
    backdrops: 'Backdrops', soundLib: 'Sounds', music: 'Music',
    newSprite: 'New sprite', newBackdrop: 'New backdrop', newSound: 'New sound',
    projectName: 'Project name', confirmDelete: 'Delete this?',
    collabLive: 'Live session', collabEnded: 'Session ended',
    hostLeft: 'The host left the session', roomNotFound: 'No session found with that code',
    nameLabel: 'Your name', namePlaceholder: 'Enter your name',
    welcome: 'Welcome to CRAFT WARP', welcomeBody: 'A lightweight, fast block editor written in Rust. Imports and exports Scratch .sb3 projects, ships a sprite/sound/backdrop library, and adds live collaboration over a simple code.',
    about: 'About', docs: 'Guide', shortcut: 'Shortcuts',
    connected: 'Connected', disconnected: 'Offline', connecting: 'Connecting…',
    guests: 'Guests', noCollab: 'You are not in a session',
    activityJoin: 'joined the session', activityLeave: 'left the session', activitySprite: 'edited sprite',
    activityBlocks: 'moved blocks', activityChat: 'sent a message', activityCostume: 'changed costume',
    exeHint: 'The download button in the bottom bar pulls the latest build from GitHub releases.',
    loading: 'Loading…', projectLoaded: 'Project loaded', sb3Imported: 'Scratch project imported',
    errorImport: 'Could not import that file', savedServer: 'Saved to server', noServer: 'Server unavailable',
    nothingHere: 'Nothing here yet', selectSprite: 'Select a sprite to start',
    variables: 'Variables', myBlocks: 'My Blocks', makeVar: 'Make a Variable', makeList: 'Make a List',
    noCostumes: 'No costumes — add one from the library', noSounds: 'No sounds — add one from the library',
    playSound: 'Play', stopAll: 'Stop all', clear: 'Clear',
    unsupported: 'Not supported in this browser',
    reconnect: 'Reconnect', hostingSince: 'Session started', codeCopied: 'Code copied',
  },
};

let lang = localStorage.getItem('cw-lang') || 'ar';
const listeners = new Set();

export function t(key, fallback) {
  const table = DICT[lang] || DICT.ar;
  return table[key] ?? DICT.ar[key] ?? fallback ?? key;
}

export function getLang() { return lang; }

export function setLang(next) {
  lang = next === 'en' ? 'en' : 'ar';
  localStorage.setItem('cw-lang', lang);
  applyI18n();
  listeners.forEach((fn) => { try { fn(lang); } catch { /* ignore */ } });
}

export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function applyI18n(root = document) {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = lang === 'ar' ? 'rtl' : 'ltr';
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const value = t(key, el.textContent);
    if (value) el.textContent = value;
  });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'), ''));
  });
}

export function toggleLang() { setLang(lang === 'ar' ? 'en' : 'ar'); }

export const BLOCK_LANG_NOTE = 'Block labels follow Scratch opcodes (English) so .sb3 stays byte-compatible.';
