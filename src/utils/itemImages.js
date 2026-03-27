const normalizeUrl = (value) => {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') {
    if (typeof value.url === 'string') return value.url.trim()
    if (typeof value.src === 'string') return value.src.trim()
  }
  return ''
}

const toUrlArray = (value) => {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return value.split(',')
  if (typeof value === 'object') {
    if (typeof value.url === 'string') return [value.url]
    if (typeof value.src === 'string') return [value.src]
  }
  return []
}

const collectUrls = (...values) => {
  const output = []
  values.forEach((value) => {
    toUrlArray(value).forEach((entry) => {
      const cleaned = normalizeUrl(entry)
      if (cleaned) output.push(cleaned)
    })
  })
  return output
}

export const getItemImages = (item) => {
  if (!item) return []

  const primary =
    normalizeUrl(item.imageUrl) ||
    normalizeUrl(item.imageURL) ||
    normalizeUrl(item.primaryImage) ||
    normalizeUrl(item.thumbnail) ||
    ''

  const gathered = collectUrls(
    item.images,
    item.imageUrls,
    item.imageURL,
    item.imageUrl,
    item.image,
    item.photoUrl,
    item.photoURL,
    item.thumbnail
  )

  const unique = []
  const seen = new Set()

  if (primary) {
    seen.add(primary)
    unique.push(primary)
  }

  gathered.forEach((url) => {
    if (seen.has(url)) return
    seen.add(url)
    unique.push(url)
  })

  return unique.slice(0, 10)
}

export const getPrimaryImage = (item) => getItemImages(item)[0] || ''
