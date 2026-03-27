import { Modal, ModalBody } from "flowbite-react"
import { useEffect, useMemo, useState } from "react"
import Input from "../Input/Input"
import { UserAuth } from "../Context/Auth"
import { addDoc, collection, doc, updateDoc } from "firebase/firestore"
import { fireStore, storage } from "../Firebase/Firebase"
import { getDownloadURL, ref, uploadBytes } from "firebase/storage"
import fileUpload from '../../assets/fileUpload.svg'
import loading from '../../assets/loading.gif'
import close from '../../assets/close.svg'

const Sell = (props) => {  
    const {toggleModalSell,status ,setItems} = props

    const [title,setTitle] = useState('')
    const [category,setCategory] = useState('')
    const [price,setPrice] = useState('')
    const [description,setDescription] = useState('')
    const [images,setImages] = useState([])
    const [video,setVideo] = useState(null)
    const [submitting,setSubmitting] = useState(false)

    const auth = UserAuth();

    const MAX_IMAGE_COUNT = 6
    const MAX_FILE_MB = 8
    const MAX_DIMENSION = 2200
    const JPEG_QUALITY = 0.88

    const imagePreviews = useMemo(
        () => images.map((file) => URL.createObjectURL(file)),
        [images]
    )

    useEffect(() => {
        return () => {
            imagePreviews.forEach((url) => URL.revokeObjectURL(url))
        }
    }, [imagePreviews])

    const handleImageUpload = (event) => {
        const selectedFiles = Array.from(event.target.files || [])
        if(selectedFiles.length === 0) return

        const allowedCount = MAX_IMAGE_COUNT - images.length
        if(allowedCount <= 0){
            alert(`You can upload up to ${MAX_IMAGE_COUNT} images only.`)
            event.target.value = ''
            return
        }

        const filesToValidate = selectedFiles.slice(0, allowedCount)
        const validFiles = []
        const rejected = []

        filesToValidate.forEach((file) => {
            if(!file.type.startsWith('image/')){
                rejected.push(`${file.name}: invalid file type`)
                return
            }
            const sizeMb = file.size / (1024 * 1024)
            if(sizeMb > MAX_FILE_MB){
                rejected.push(`${file.name}: larger than ${MAX_FILE_MB}MB`)
                return
            }
            validFiles.push(file)
        })

        if(validFiles.length > 0){
            setImages((prev) => [...prev, ...validFiles].slice(0, MAX_IMAGE_COUNT))
        }

        if(selectedFiles.length > allowedCount){
            rejected.push(`Only ${MAX_IMAGE_COUNT} images are allowed`)
        }

        if(rejected.length > 0){
            alert(`Some files were skipped:\n${rejected.slice(0, 4).join('\n')}`)
        }

        event.target.value = ''
    }

    const removeImageAt = (indexToRemove) => {
        setImages((prev) => prev.filter((_, index) => index !== indexToRemove))
    }

    const handleVideoUpload = (event)=>{
        const file = event.target.files?.[0]
        if(!file) return
        if(!file.type.startsWith('video/')){
            alert('Please upload a valid video file')
            return
        }
        const sizeMb = file.size / (1024 * 1024)
        if(sizeMb > 120){
            alert('Video too large. Keep it under 120MB for smooth upload.')
            return
        }
        setVideo(file)
    }
    
    const handleSubmit = async (event)=>{
        event.preventDefault();

        if(!auth?.user){
            alert('Please login to continue');
            return;
        }

        const trimmedTitle = title.trim();
        const trimmedCategory = category.trim();
        const trimmedPrice = price.trim();
        const trimmedDescription = description.trim();
  
        if(!trimmedTitle || !trimmedCategory ||!trimmedPrice || !trimmedDescription){
            alert('All fields are required');
            return;
        }

        setSubmitting(true)

        const resizeImage = (file) => {
            return new Promise((resolve, reject) => {
                const img = new Image()
                const reader = new FileReader()

                reader.onload = () => {
                    img.src = reader.result
                }
                reader.onerror = reject

                img.onload = () => {
                    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
                    const targetW = Math.round(img.width * scale)
                    const targetH = Math.round(img.height * scale)

                    const canvas = document.createElement('canvas')
                    canvas.width = targetW
                    canvas.height = targetH
                    const ctx = canvas.getContext('2d')
                    if (!ctx) {
                        reject(new Error('Canvas not supported'))
                        return
                    }
                    ctx.drawImage(img, 0, 0, targetW, targetH)

                    canvas.toBlob(
                        (blob) => {
                            if(!blob){
                                reject(new Error('Image compression failed'))
                                return
                            }
                            resolve(blob)
                        },
                        'image/jpeg',
                        JPEG_QUALITY
                    )
                }
                img.onerror = reject
                reader.readAsDataURL(file)
            })
        }

        const optimizeImageForUpload = async (file) => {
            if (file.type === 'image/svg+xml' || file.size <= 150 * 1024) {
                const ext = file.name?.split('.').pop() || 'svg'
                return { fileToUpload: file, extension: ext }
            }
            const optimizedBlob = await resizeImage(file)
            const optimizedFile = new File(
                [optimizedBlob],
                `${file.name?.replace(/\.[^/.]+$/, '') || 'image'}.jpg`,
                { type: 'image/jpeg' }
            )
            return { fileToUpload: optimizedFile, extension: 'jpg' }
        }

        try {
            const now = new Date()
            const createdAt = now.toDateString()
            const createdAtMs = now.getTime()

            const uploadImageFile = async (imageFile, index) => {
                const { fileToUpload, extension } = await optimizeImageForUpload(imageFile)
                const baseName = (imageFile.name || `image_${index + 1}`)
                    .replace(/\.[^/.]+$/, '')
                    .replace(/[^\w-]+/g, '_')
                    .slice(0, 40) || `image_${index + 1}`
                const imageRef = ref(
                    storage,
                    `products/${auth.user.uid}/${Date.now()}_${index + 1}_${baseName}.${extension || 'jpg'}`
                )
                const imageSnap = await uploadBytes(imageRef, fileToUpload)
                return getDownloadURL(imageSnap.ref)
            }

            const uploadVideoFile = async (file) => {
                const vidRef = ref(storage, `videos/${auth.user.uid}/${Date.now()}_${file.name}`)
                const snap = await uploadBytes(vidRef, file)
                return getDownloadURL(snap.ref)
            }

            const [firstImage, ...restImages] = images
            const firstImageUrl = firstImage ? await uploadImageFile(firstImage, 0) : ''

            const docRef = await addDoc(collection(fireStore, 'products'), {
                title: trimmedTitle,
                category: trimmedCategory,
                price: trimmedPrice,
                description: trimmedDescription,
                imageUrl: firstImageUrl,
                images: firstImageUrl ? [firstImageUrl] : [],
                videoUrl: '',
                userId: auth.user.uid,
                userName: auth.user.displayName || 'Anonymous',
                createAt: createdAt,
                createdAt: createdAtMs,
                uploadStatus: 'pending',
            });

            const optimisticItem = {
                id: docRef.id,
                title: trimmedTitle,
                category: trimmedCategory,
                price: trimmedPrice,
                description: trimmedDescription,
                imageUrl: firstImageUrl,
                images: firstImageUrl ? [firstImageUrl] : [],
                videoUrl: '',
                userId: auth.user.uid,
                userName: auth.user.displayName || 'Anonymous',
                createAt: createdAt,
                createdAt: createdAtMs,
                uploadStatus: 'pending',
            }

            setItems((prev) => [optimisticItem, ...(prev || [])])

            const restImagePromises = restImages.map((imageFile, index) =>
                uploadImageFile(imageFile, index + 1)
            )

            let videoUrl = ''
            let videoFailed = false
            if (video) {
                try {
                    videoUrl = await uploadVideoFile(video)
                } catch (error) {
                    console.warn('Video upload failed:', error)
                    videoFailed = true
                }
            }

            const restImageResults = await Promise.allSettled(restImagePromises)
            const restImageUrls = restImageResults
                .filter((result) => result.status === 'fulfilled')
                .map((result) => result.value)
            const failedImageCount = restImageResults.filter((result) => result.status === 'rejected').length

            const allImageUrls = [firstImageUrl, ...restImageUrls].filter(Boolean)
            const imageUrl = allImageUrls[0] || firstImageUrl

            await updateDoc(doc(fireStore, 'products', docRef.id), {
                imageUrl,
                images: allImageUrls,
                videoUrl,
                uploadStatus: (allImageUrls.length || videoUrl) ? 'complete' : 'failed',
                updatedAt: Date.now(),
            })

            setItems((prev) => (prev || []).map((item) => (
                item.id === docRef.id
                    ? { ...item, imageUrl, images: allImageUrls, videoUrl, uploadStatus: (allImageUrls.length || videoUrl) ? 'complete' : 'failed' }
                    : item
            )))

            setImages([]);
            setVideo(null);
            toggleModalSell();

            if (failedImageCount > 0 || videoFailed) {
                alert('Listing published, but some media failed to upload. You can edit and re-upload later.')
            }
            
        } catch (error) {
            console.log(error);
            alert(error?.message || error?.code || 'Failed to publish listing. Please try again.')
            
        }finally{
            setSubmitting(false)
        }
    }

  return (
    <div>
        <Modal  theme={{
            "root": {
                "base": "fixed inset-x-0 top-0 z-[1200] h-[100dvh] overflow-y-auto overflow-x-hidden md:inset-0"
            },
             "content": {
                "base": "relative w-full p-2 sm:p-4 md:h-auto",
                "inner": "relative flex max-h-[calc(100dvh-2rem)] max-w-[900px] w-full mx-auto flex-col rounded-3xl bg-white shadow-2xl overflow-hidden"
            },
        }}  onClick={toggleModalSell} show={status}  className="xchange-modal-layer !z-[1200] bg-black/60 backdrop-blur-sm"  position={'center'}  size="xl" popup= {true}>
            <ModalBody  className="bg-gradient-to-br from-sky-50 via-white to-white p-0 rounded-3xl h-full max-h-[calc(100dvh-2rem)] overflow-y-auto"   onClick={(event) => event.stopPropagation()}>
                <img 
                onClick={()=>{
                    toggleModalSell();
                    setImages([]);
                    setVideo(null);
                }}
                className="w-6 absolute z-20 top-6 right-8 cursor-pointer hover:scale-105 transition"
                src={close} alt="" />
               
                <div className="relative overflow-hidden rounded-2xl">
                  <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.12),transparent_45%),radial-gradient(circle_at_90%_10%,rgba(59,130,246,0.12),transparent_40%)]" />
                  <div className="p-6 sm:p-8 space-y-5 relative z-10 h-full overflow-auto">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Create listing</p>
                        <p  className="font-extrabold text-2xl text-slate-900 mt-1">Sell an item</p>
                        <p className="text-sm text-slate-600 mt-1">Add a great title, fair price, and clear photos to stand out.</p>
                      </div>
                      <div className="hidden sm:flex items-center gap-2 text-sky-700 font-semibold bg-white/70 border border-sky-100 px-3 py-1.5 rounded-full shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Live preview
                      </div>
                    </div>

                    <form  onSubmit={handleSubmit} className="space-y-3">
                       <Input setInput={setTitle} placeholder ='Title' />
                       <Input setInput={setCategory} placeholder='Category'/>
                       <Input setInput={setPrice} placeholder='Price'/>
                       <Input setInput={setDescription} placeholder='Description'/>

                       <div  className="pt-2 w-full relative">
                       {images.length > 0 ? (
                        <div className="border border-sky-200 rounded-2xl overflow-hidden bg-white shadow-sm p-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {imagePreviews.map((preview, index) => (
                              <div key={`${preview}_${index}`} className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                                <img  className="h-28 w-full object-cover" src={preview} alt={`Uploaded ${index + 1}`} />
                                <button
                                  type="button"
                                  onClick={() => removeImageAt(index)}
                                  className="absolute top-2 right-2 text-[10px] px-2 py-1 rounded-full bg-white/90 border border-slate-200 shadow-sm hover:bg-white"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                            {images.length < MAX_IMAGE_COUNT ? (
                              <label className="relative h-28 rounded-xl border-2 border-dashed border-sky-200 flex flex-col items-center justify-center bg-white hover:border-sky-400 hover:bg-sky-50 transition cursor-pointer">
                                <input
                                  onChange={handleImageUpload}
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="absolute inset-0 h-full w-full opacity-0 cursor-pointer z-30"
                                />
                                <p className="text-xs font-semibold text-slate-700">+ Add more</p>
                              </label>
                            ) : null}
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <p className="text-xs text-slate-500">{images.length}/{MAX_IMAGE_COUNT} images selected</p>
                            <button
                              type="button"
                              onClick={() => setImages([])}
                              className="text-xs px-3 py-1 rounded-full bg-white border border-slate-200 hover:bg-slate-50"
                            >
                              Clear all
                            </button>
                          </div>
                        </div>
                       ) : (
                       <label  className="relative h-64 sm:h-72 w-full border-2 border-dashed border-sky-200 rounded-2xl flex flex-col items-center justify-center bg-white hover:border-sky-400 hover:bg-sky-50 transition cursor-pointer shadow-sm">
                           <input
                           onChange={handleImageUpload}
                           type="file"
                           accept="image/*"
                           multiple
                           className="absolute inset-0 h-full w-full opacity-0 cursor-pointer z-30"
                           required={images.length === 0}
                           />

                            <div  className="flex flex-col items-center gap-2 pointer-events-none">
                                <img  className="w-12" src={fileUpload} alt="" />
                                <p  className="text-center text-sm font-semibold text-slate-800">Drop or click to upload images</p>
                             <p  className="text-center text-xs text-slate-500">Upload 1-{MAX_IMAGE_COUNT} images (SVG, PNG, JPG under {MAX_FILE_MB}MB each)</p>
                            </div>
                       </label>
                       )} 

                      </div>

                      <div className="pt-4 w-full">
                        <p className="text-sm font-semibold text-slate-800 mb-2">Optional video walk-through (60-120s, &lt;120MB)</p>
                        {video ? (
                          <div className="relative h-48 w-full border border-amber-200 rounded-2xl overflow-hidden bg-white shadow-sm flex items-center justify-center">
                            <video className="h-full" src={URL.createObjectURL(video)} controls />
                            <button
                              type="button"
                              onClick={() => setVideo(null)}
                              className="absolute top-3 right-3 text-xs px-2 py-1 rounded-full bg-white/80 border border-slate-200 shadow-sm hover:bg-white"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <label className="relative h-20 w-full border-2 border-dashed border-amber-200 rounded-xl flex flex-col sm:flex-row items-center justify-between px-4 bg-amber-50/60 hover:border-amber-400 transition cursor-pointer text-sm text-amber-800 gap-2">
                            <input
                              onChange={handleVideoUpload}
                              type="file"
                              accept="video/*"
                              className="absolute inset-0 h-full w-full opacity-0 cursor-pointer z-30"
                            />
                            <span className="font-semibold">Add quick walkthrough video</span>
                            <span className="text-xs">MP4 / MOV recommended</span>
                          </label>
                        )}
                      </div>
                       

                        {
                         submitting? (
                             <div className="w-full flex h-14 justify-center pt-4 pb-2">
                                 <img className="w-28 object-cover" src={loading} alt="" />
                             </div>
                         ) : (
                             <div  className="w-full pt-2">
                                 <button  className="w-full p-3 rounded-xl text-white font-semibold shadow-lg shadow-sky-200/60 hover:-translate-y-[1px] active:translate-y-0 transition"
                                 style={{ background: 'linear-gradient(135deg,#0f172a,#0ea5e9)' }}
                                 >Publish listing</button>
                             </div>
                         )
                        }
                     
                    </form>
                  </div>
                </div>
            </ModalBody>

        </Modal  >
    </div>
  )
}

export default Sell
