/**
 * Bot replies in the three languages the site speaks.
 *
 * Telegram hands over the client's `language_code`, so nobody has to pick a
 * language: an Uzbek phone gets Uzbek. Anything else falls back to English.
 * The wording matches the site's, because a person who meets one should
 * recognise the other.
 */
export type BotLocale = 'en' | 'ru' | 'uz'

export function localeOf(languageCode: string | undefined): BotLocale {
  const code = (languageCode ?? '').toLowerCase()
  if (code.startsWith('ru')) return 'ru'
  if (code.startsWith('uz')) return 'uz'
  return 'en'
}

interface Strings {
  greeting: string
  howTo: string
  privacy: string
  countImages: (n: number) => string
  countPdfs: (n: number) => string
  makePdfA4: string
  makePdfOriginal: string
  mergePdfs: string
  clear: string
  cleared: string
  nothingToDo: string
  working: string
  mixed: string
  unsupported: string
  tooMany: (max: number) => string
  tooHeavy: string
  tooBig: string
  failed: string
  caption: (url: string) => string
  sendAsFile: string
}

const en: Strings = {
  greeting: 'Send me photos and I will turn them into one PDF. Send PDFs instead and I will merge them.',
  howTo: 'No limit on how many. Send them all, then press the button.',
  privacy: 'Your files are never saved: they are converted in memory and gone the moment the PDF is sent.',
  countImages: n => `${n} photo${n === 1 ? '' : 's'} received. Send more, or:`,
  countPdfs: n => `${n} PDF${n === 1 ? '' : 's'} received. Send more, or:`,
  makePdfA4: '📄 Make PDF (A4)',
  makePdfOriginal: '🖼 Make PDF (photo size)',
  mergePdfs: '📎 Merge into one PDF',
  clear: '✖ Start over',
  cleared: 'Cleared. Send new files whenever you like.',
  nothingToDo: 'Nothing to convert yet — send me some photos first.',
  working: 'Making your PDF…',
  mixed: 'Photos and PDFs at once I cannot do yet. Press "Start over", then send one kind.',
  unsupported: 'I can take photos, JPG, PNG and PDF files.',
  tooMany: max => `That is the ${max}-file limit. Press the button to make the PDF, then send the rest.`,
  tooHeavy: 'That would make the PDF too heavy to send back. Make this one, then send the rest.',
  tooBig: 'Telegram only lets bots download files up to 20 MB. This one is bigger.',
  failed: 'Something went wrong with that file and I left it out.',
  caption: url => `Done. More free tools: ${url}`,
  sendAsFile: 'Tip: Telegram shrinks photos. For passports and documents, send them as a file to keep full quality.'
}

const ru: Strings = {
  greeting: 'Отправьте фотографии — соберу их в один PDF. Пришлёте PDF-файлы — объединю их.',
  howTo: 'Количество не ограничено. Отправьте все, потом нажмите кнопку.',
  privacy: 'Ваши файлы нигде не сохраняются: они обрабатываются в памяти и исчезают сразу после отправки PDF.',
  countImages: n => `Получено фото: ${n}. Отправьте ещё или:`,
  countPdfs: n => `Получено PDF: ${n}. Отправьте ещё или:`,
  makePdfA4: '📄 Собрать PDF (A4)',
  makePdfOriginal: '🖼 Собрать PDF (размер фото)',
  mergePdfs: '📎 Объединить в один PDF',
  clear: '✖ Начать заново',
  cleared: 'Очищено. Присылайте новые файлы когда угодно.',
  nothingToDo: 'Пока нечего собирать — отправьте сначала фотографии.',
  working: 'Собираю PDF…',
  mixed: 'Фото и PDF одновременно пока не умею. Нажмите «Начать заново» и отправьте что-то одно.',
  unsupported: 'Принимаю фотографии, JPG, PNG и PDF.',
  tooMany: max => `Это предел — ${max} файлов. Нажмите кнопку, соберите PDF, потом присылайте остальное.`,
  tooHeavy: 'PDF получится слишком тяжёлым для отправки. Соберите этот, потом присылайте остальное.',
  tooBig: 'Telegram разрешает ботам скачивать файлы только до 20 МБ. Этот больше.',
  failed: 'С этим файлом что-то не так — я его пропустил.',
  caption: url => `Готово. Больше бесплатных инструментов: ${url}`,
  sendAsFile: 'Совет: Telegram сжимает фотографии. Для паспортов и документов отправляйте их файлом — качество сохранится.'
}

const uz: Strings = {
  greeting: "Suratlarni yuboring — ularni bitta PDF ga yig'aman. PDF yuborsangiz, ularni birlashtiraman.",
  howTo: "Soni cheklanmagan. Hammasini yuboring, keyin tugmani bosing.",
  privacy: "Fayllaringiz hech qayerda saqlanmaydi: xotirada ishlanadi va PDF yuborilishi bilan yo'qoladi.",
  countImages: n => `${n} ta surat qabul qilindi. Yana yuboring yoki:`,
  countPdfs: n => `${n} ta PDF qabul qilindi. Yana yuboring yoki:`,
  makePdfA4: '📄 PDF yasash (A4)',
  makePdfOriginal: '🖼 PDF yasash (surat o\'lchami)',
  mergePdfs: '📎 Bitta PDF ga birlashtirish',
  clear: '✖ Boshidan boshlash',
  cleared: "Tozalandi. Istagan vaqtda yangi fayl yuboring.",
  nothingToDo: "Hozircha yig'adigan narsa yo'q — avval surat yuboring.",
  working: 'PDF tayyorlanmoqda…',
  mixed: "Surat va PDF ni bir vaqtda hali qila olmayman. «Boshidan boshlash» ni bosing va bittasini yuboring.",
  unsupported: 'Surat, JPG, PNG va PDF fayllarni qabul qilaman.',
  tooMany: max => `Bu ${max} ta fayl chegarasi. Tugmani bosib PDF yasang, keyin qolganini yuboring.`,
  tooHeavy: "PDF yuborish uchun juda og'ir bo'lib qoladi. Shuni yasang, keyin qolganini yuboring.",
  tooBig: "Telegram botlarga faqat 20 MB gacha fayl yuklab olishga ruxsat beradi. Bu kattaroq.",
  failed: "Bu fayl bilan nimadir noto'g'ri — uni tashlab ketdim.",
  caption: url => `Tayyor. Yana bepul vositalar: ${url}`,
  sendAsFile: "Maslahat: Telegram suratlarni siqadi. Pasport va hujjatlar uchun ularni fayl sifatida yuboring — sifat saqlanadi."
}

export const STRINGS: Record<BotLocale, Strings> = { en, ru, uz }
