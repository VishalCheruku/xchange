import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../Navbar/Navbar'
import { ItemsContext } from '../Context/Item'
import Card from '../Card/Card'
import semanticRank from '../../utils/semanticSearch'

const Search = () => {
  const itemsCtx = ItemsContext()
  const [searchParams] = useSearchParams()
  const [queryText, setQueryText] = useState('')
  const [imageUrlHint, setImageUrlHint] = useState('')
  const [uploadPreview, setUploadPreview] = useState('')

  useEffect(() => {
    const queryFromUrl = String(searchParams.get('q') || '').trim()
    if (!queryFromUrl) return
    setQueryText(queryFromUrl)
  }, [searchParams])

  const results = useMemo(() => {
    const ranked = semanticRank(itemsCtx.items || [], { queryText, imageUrlHint: imageUrlHint || uploadPreview })
    return ranked.slice(0, 20).map((entry) => entry.item)
  }, [itemsCtx.items, queryText, imageUrlHint, uploadPreview])

  const handleFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setUploadPreview(reader.result?.toString() || '')
    reader.readAsDataURL(file)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-slate-900 text-white">
      <Navbar />
      <section className="pt-28 pb-6 px-5 sm:px-10 md:px-16 lg:px-24">
        <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Visual + semantic search</p>
          <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold text-white">Find items by text or image</h1>
          <p className="mt-2 text-slate-300 max-w-2xl">Type what you want or drop an image/URL. Results are scored semantically and by visual hint (mocked, swappable for CLIP/OpenAI embeddings).</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <input
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="e.g., lightweight road bike, noise-cancelling headphones"
                className="w-full rounded-2xl bg-black border border-slate-700 text-white px-4 py-3 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-600/30"
              />
              <input
                value={imageUrlHint}
                onChange={(e) => setImageUrlHint(e.target.value)}
                placeholder="Image URL (optional) — paste exact item image to boost score"
                className="w-full rounded-2xl bg-black border border-slate-700 text-white px-4 py-3 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-600/30"
              />
            </div>
            <label className="relative rounded-2xl border border-dashed border-slate-700 bg-black/60 min-h-[140px] flex flex-col items-center justify-center px-4 py-6 cursor-pointer hover:border-sky-500 transition">
              <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFile}/>
              {uploadPreview ? (
                <img src={uploadPreview} alt="preview" className="h-24 object-contain" />
              ) : (
                <>
                  <p className="text-sm text-slate-300">Drop an image or click to upload</p>
                  <p className="text-xs text-slate-500 mt-1">We’ll use it as a visual hint</p>
                </>
              )}
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
            <span className="px-3 py-1 rounded-full border border-slate-700">Pluggable embeddings</span>
            <span className="px-3 py-1 rounded-full border border-slate-700">Visual hint matching</span>
            <span className="px-3 py-1 rounded-full border border-slate-700">Top 20 results</span>
          </div>
        </div>
      </section>

      <div className="pb-12">
        <Card items={results} title="Search results" subtitle={`${results.length} items`} viewMode="grid" />
      </div>
    </div>
  )
}

export default Search
