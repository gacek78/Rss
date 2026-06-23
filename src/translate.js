const TRANSLATE_API = 'https://api.mymemory.translated.net/get'
const txCache = JSON.parse(localStorage.getItem('rss_tx') || '{}')

export function saveTxCache() {
  const keys = Object.keys(txCache)
  if (keys.length > 2000) keys.slice(0, keys.length - 2000).forEach(k => delete txCache[k])
  localStorage.setItem('rss_tx', JSON.stringify(txCache))
}

export async function translateText(text) {
  if (!text?.trim()) return text
  if (txCache[text] !== undefined) return txCache[text]
  try {
    const res = await fetch(
      `${TRANSLATE_API}?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|pl`,
      { signal: AbortSignal.timeout(8000) },
    )
    const data = await res.json()
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      txCache[text] = data.responseData.translatedText
      return txCache[text]
    }
  } catch {}
  txCache[text] = text
  return text
}

export function getCachedTranslation(text) {
  return txCache[text]
}
