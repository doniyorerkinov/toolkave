/**
 * Bot replies in the three languages the site speaks.
 *
 * Telegram hands over the client's `language_code`, so nobody has to pick a
 * language: an Uzbek phone gets Uzbek. Anything else falls back to English.
 * The wording matches the site's, because a person who meets one should
 * recognise the other.
 */
/**
 * The one message that cannot be in a language, because it is the message that
 * asks which language to use. All three at once, so whichever of them the
 * reader knows, one of these clauses lands.
 */
export const CHOOSE_LANGUAGE = "Tilni tanlang  ·  Выберите язык  ·  Choose your language"

/** Each written in itself: nobody has to read another language to find theirs. */
export const LANGUAGE_BUTTONS = [
  [{ text: "🇺🇿  O'zbekcha", callback_data: 'lang:uz' }],
  [{ text: '🇷🇺  Русский', callback_data: 'lang:ru' }],
  [{ text: '🇬🇧  English', callback_data: 'lang:en' }]
]

export type BotLocale = 'en' | 'ru' | 'uz'

export function localeOf(languageCode: string | undefined): BotLocale {
  const code = (languageCode ?? '').toLowerCase()
  if (code.startsWith('ru')) return 'ru'
  if (code.startsWith('uz')) return 'uz'
  return 'en'
}

interface Strings {
  greeting: string
  /** What the bot can do, one line each. Listed so nobody has to guess. */
  can: string[]
  /** How to get the language picker back, shown once the choice is made. */
  changeLanguage: string
  /** Button labels on /start, for people who expect a menu rather than prose. */
  menu: { photos: string; merge: string }
  /** What each of those buttons answers with: what to send, nothing more. */
  how: { photos: string; merge: string }
  privacy: string
  countImages: (n: number) => string
  countPdfs: (n: number) => string
  /** One PDF cannot be merged with itself; say what would actually help. */
  countOnePdf: string
  makePdfA4: string
  /** Labels for a batch holding both: "make a PDF" is photo talk, and wrong here. */
  combineA4: string
  combineOriginal: string
  makePdfOriginal: string
  mergePdfs: string
  clear: string
  cleared: string
  nothingToDo: string
  working: string
  countMixed: (photos: number, pdfs: number) => string
  unsupported: string
  /** Said back when a plain-text message has been passed to a human. */
  feedbackSent: string
  tooMany: (max: number) => string
  tooHeavy: string
  tooBig: string
  failed: string
  caption: (url: string) => string
  sendAsFile: string
  limits: string
}

const en: Strings = {
  greeting: 'Send me a file and I will show you what I can do with it. Everything here is free.',
  can: [
    '📄  Photos into one PDF, A4 pages or photo size',
    '📎  Several PDFs into one',
  ],
  changeLanguage: 'Wrong language? /language',
  menu: {
    photos: '📄 Photos → PDF',
    merge: '📎 Merge PDFs'
  },
  how: {
    photos: 'Send me the photos — a few at a time or all at once. When you have sent them all, press the button and I will send back one PDF.',
    merge: 'Send me the PDF files, in the order you want them. Then press the button and I will join them into one.'
  },
  privacy: 'Your files are never saved: they are converted in memory and gone the moment the PDF is sent.',
  countImages: n => `${n} photo${n === 1 ? '' : 's'} received. Send more, or:`,
  countPdfs: n => `${n} PDF${n === 1 ? '' : 's'} received. Send more, or:`,
  countOnePdf: 'One PDF received. Send another and I will join them into one.',
  combineA4: '📑 Make one document (A4)',
  combineOriginal: '🖼 One document (photo size)',
  makePdfA4: '📄 Make PDF (A4)',
  makePdfOriginal: '🖼 Make PDF (photo size)',
  mergePdfs: '📎 Merge into one PDF',
  clear: '✖ Start over',
  cleared: 'Cleared. Send new files whenever you like.',
  nothingToDo: 'Nothing to convert yet — send me some photos first.',
  working: 'Making your PDF…',
  countMixed: (photos, pdfs) =>
    `${photos} photo${photos === 1 ? '' : 's'} and ${pdfs} PDF${pdfs === 1 ? '' : 's'} received. I will keep the order you sent them in. Send more, or:`,
  unsupported: 'I can take photos, JPG, PNG and PDF files.',
  feedbackSent: 'Thank you — a person will read that.',
  tooMany: max => `That is the ${max}-file limit. Press the button to make the PDF, then send the rest.`,
  tooHeavy: 'That would make the PDF too heavy to send back. Make this one, then send the rest.',
  tooBig: 'Telegram only lets bots download files up to 20 MB. This one is bigger.',
  failed: 'Something went wrong with that file and I left it out.',
  caption: url => `Done. More free tools: ${url}`,
  sendAsFile: 'Tip: Telegram shrinks photos. For passports and documents, send them as a file to keep full quality.',
  limits: "One file can be up to 20 MB — that is Telegram's limit for bots, not mine. Photograph the pages instead of sending one huge scan."
}

const ru: Strings = {
  greeting: 'Пришлите файл — покажу, что я могу с ним сделать. Всё бесплатно.',
  can: [
    '📄  Фотографии в один PDF, страницы A4 или размер фото',
    '📎  Несколько PDF в один',
  ],
  changeLanguage: 'Не тот язык? /language',
  menu: {
    photos: '📄 Фото → PDF',
    merge: '📎 Объединить PDF'
  },
  how: {
    photos: 'Присылайте фотографии — по несколько или все сразу. Когда пришлёте все, нажмите кнопку, и я верну один PDF.',
    merge: 'Пришлите PDF-файлы в том порядке, в каком они нужны. Потом нажмите кнопку — соберу их в один.'
  },
  privacy: 'Ваши файлы нигде не сохраняются: они обрабатываются в памяти и исчезают сразу после отправки PDF.',
  countImages: n => `Получено фото: ${n}. Отправьте ещё или:`,
  countPdfs: n => `Получено PDF: ${n}. Отправьте ещё или:`,
  countOnePdf: 'Получен 1 PDF. Пришлите ещё один — объединю их в один файл.',
  combineA4: '📑 Собрать один документ (A4)',
  combineOriginal: '🖼 Один документ (размер фото)',
  makePdfA4: '📄 Собрать PDF (A4)',
  makePdfOriginal: '🖼 Собрать PDF (размер фото)',
  mergePdfs: '📎 Объединить в один PDF',
  clear: '✖ Начать заново',
  cleared: 'Очищено. Присылайте новые файлы когда угодно.',
  nothingToDo: 'Пока нечего собирать — отправьте сначала фотографии.',
  working: 'Собираю PDF…',
  countMixed: (photos, pdfs) =>
    `Получено фото: ${photos}, PDF: ${pdfs}. Порядок сохраню тот, в котором вы прислали. Отправьте ещё или:`,
  unsupported: 'Принимаю фотографии, JPG, PNG и PDF.',
  feedbackSent: 'Спасибо — это прочитает живой человек.',
  tooMany: max => `Это предел — ${max} файлов. Нажмите кнопку, соберите PDF, потом присылайте остальное.`,
  tooHeavy: 'PDF получится слишком тяжёлым для отправки. Соберите этот, потом присылайте остальное.',
  tooBig: 'Telegram разрешает ботам скачивать файлы только до 20 МБ. Этот больше.',
  failed: 'С этим файлом что-то не так — я его пропустил.',
  caption: url => `Готово. Больше бесплатных инструментов: ${url}`,
  sendAsFile: 'Совет: Telegram сжимает фотографии. Для паспортов и документов отправляйте их файлом — качество сохранится.',
  limits: 'Один файл — до 20 МБ: это ограничение Telegram для ботов, не моё. Фотографируйте страницы, а не присылайте один огромный скан.'
}

const uz: Strings = {
  greeting: "Fayl yuboring — u bilan nima qila olishimni ko'rsataman. Hammasi bepul.",
  can: [
    "📄  Suratlardan bitta PDF, A4 sahifa yoki surat o'lchami",
    "📎  Bir nechta PDF dan bitta PDF"
  ],
  changeLanguage: "Til noto'g'rimi? /language",
  menu: {
    photos: '📄 Surat → PDF',
    merge: '📎 PDF birlashtirish'
  },
  how: {
    photos: "Suratlarni yuboring — bir nechtadan yoki hammasini birvarakayiga. Hammasini yuborib bo'lgach, tugmani bosing, men bitta PDF qaytaraman.",
    merge: "PDF fayllarni kerakli tartibda yuboring. Keyin tugmani bosing — ularni bittaga birlashtiraman."
  },
  privacy: "Fayllaringiz hech qayerda saqlanmaydi: xotirada ishlanadi va PDF yuborilishi bilan yo'qoladi.",
  countImages: n => `${n} ta surat qabul qilindi. Yana yuboring yoki:`,
  countPdfs: n => `${n} ta PDF qabul qilindi. Yana yuboring yoki:`,
  countOnePdf: '1 ta PDF qabul qilindi. Yana bittasini yuboring — ularni birlashtiraman.',
  combineA4: '📑 Bitta hujjat qilish (A4)',
  combineOriginal: "🖼 Bitta hujjat (surat o'lchami)",
  makePdfA4: '📄 PDF yasash (A4)',
  makePdfOriginal: '🖼 PDF yasash (surat o\'lchami)',
  mergePdfs: '📎 Bitta PDF ga birlashtirish',
  clear: '✖ Boshidan boshlash',
  cleared: "Tozalandi. Istagan vaqtda yangi fayl yuboring.",
  nothingToDo: "Hozircha yig'adigan narsa yo'q — avval surat yuboring.",
  working: 'PDF tayyorlanmoqda…',
  countMixed: (photos, pdfs) =>
    `${photos} ta surat va ${pdfs} ta PDF qabul qilindi. Yuborgan tartibingizni saqlab qolaman. Yana yuboring yoki:`,
  unsupported: 'Surat, JPG, PNG va PDF fayllarni qabul qilaman.',
  feedbackSent: "Rahmat — buni tirik odam o'qiydi.",
  tooMany: max => `Bu ${max} ta fayl chegarasi. Tugmani bosib PDF yasang, keyin qolganini yuboring.`,
  tooHeavy: "PDF yuborish uchun juda og'ir bo'lib qoladi. Shuni yasang, keyin qolganini yuboring.",
  tooBig: "Telegram botlarga faqat 20 MB gacha fayl yuklab olishga ruxsat beradi. Bu kattaroq.",
  failed: "Bu fayl bilan nimadir noto'g'ri — uni tashlab ketdim.",
  caption: url => `Tayyor. Yana bepul vositalar: ${url}`,
  sendAsFile: "Maslahat: Telegram suratlarni siqadi. Pasport va hujjatlar uchun ularni fayl sifatida yuboring — sifat saqlanadi.",
  limits: "Bitta fayl 20 MB gacha — bu Telegram ning botlar uchun cheklovi, meniki emas. Bitta katta skan yuborish o'rniga sahifalarni suratga oling."
}

export const STRINGS: Record<BotLocale, Strings> = { en, ru, uz }
